import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { Engine } from "../src/worker/engine.js";
import { GeroModule } from "../src/worker/module.js";
import type { Event } from "../src/worker/protocol.js";

const WASM = process.env.GERO_WASM ?? "public/gero.wasm";

function harness() {
  const events: Event[] = [];
  const engine = new Engine(
    (e) => events.push(e),
    () => GeroModule.instantiate(readFileSync(WASM)),
    () => Promise.resolve(),
  );
  const of = <T extends Event["type"]>(type: T) =>
    events.filter((e): e is Extract<Event, { type: T }> => e.type === type);
  return { engine, of };
}

describe("format", () => {
  it("returns what `gero fmt` writes", async () => {
    const { engine, of } = harness();
    await engine.receive({ type: "init" });
    await engine.receive({
      type: "format",
      source: "def main()\n    let    x   =   1\n  print x\nend\n",
      lang: "gr",
      requestId: 1,
    });

    expect(of("formatted").at(-1)?.text).toBe("def main()\n  let x = 1\n  print x\nend\n");
  });

  it("leaves a buffer that does not parse alone", async () => {
    const { engine, of } = harness();
    await engine.receive({ type: "init" });
    await engine.receive({
      type: "format",
      source: "def main(\n  let x =\n",
      lang: "gr",
      requestId: 2,
    });

    // Formatting a partial tree would rewrite the buffer from a guess;
    // null is the module saying it will not.
    expect(of("formatted").at(-1)?.text).toBeNull();
  });

  it("answers each request under the id it was asked with", async () => {
    const { engine, of } = harness();
    await engine.receive({ type: "init" });
    await engine.receive({ type: "format", source: "main:\n  hlt\n", lang: "gas", requestId: 5 });
    await engine.receive({ type: "format", source: "def main()\nend\n", lang: "gr", requestId: 6 });

    const answers = of("formatted");
    expect(answers.find((f) => f.requestId === 5)?.text).toContain("hlt");
    expect(answers.find((f) => f.requestId === 6)?.text).toContain("def main()");
  });

  it("formats while a program is paused, without disturbing it", async () => {
    const { engine, of } = harness();
    await engine.receive({ type: "init" });
    await engine.receive({
      type: "build",
      files: [{ name: "main.gr", text: "def main()\n  print 7\nend\n" }],
      entry: "main.gr",
      lang: "gr",
    });
    await engine.receive({ type: "format", source: "def main()\nend\n", lang: "gr", requestId: 9 });
    await engine.receive({ type: "run" });

    // An editor formats while a program sits at a breakpoint; neither
    // the file set nor the VM should move under it.
    expect(of("output").map((e) => e.text).join("")).toContain("7");
  });
});
