import { readFile } from "node:fs/promises";
import { expect, test } from "vitest";

import { Engine } from "../src/worker/engine.js";
import { GeroModule } from "../src/worker/module.js";
import type { Diagnostic, Event } from "../src/worker/protocol.js";

async function session() {
  const events: Event[] = [];
  const bytes = await readFile("public/gero.wasm");
  const e = new Engine(
    (event) => events.push(event),
    () => GeroModule.instantiate(bytes),
    () => Promise.resolve(),
  );
  await e.receive({ type: "init" });
  return { engine: e, events };
}

const diagnosticsOf = (events: Event[], type: "checked" | "built"): Diagnostic[] => {
  const matching = events.filter((e): e is Extract<Event, { diagnostics: Diagnostic[] }> =>
    e.type === type,
  );
  const event = matching[matching.length - 1];
  if (event === undefined) throw new Error(`no ${type} event`);
  return event.diagnostics;
};

test("check: reports the CLI's own code, wording, and span", async () => {
  const { engine, events } = await session();
  await engine.receive({
    type: "check",
    files: [{ name: "main.gr", text: "def main()\n  print undefined_thing()\nend\n" }],
    entry: "main.gr",
    lang: "gr",
  });

  const diagnostics = diagnosticsOf(events, "checked");
  expect(diagnostics.length).toBeGreaterThan(0);
  const [first] = diagnostics;
  expect(first!.file).toBe("main.gr");
  expect(first!.code).toMatch(/^E_/);
  expect(first!.severity).toBe("error");
  // The editor draws a squiggle from these, so a span that does not
  // reach the reported line is a marker on the wrong text.
  expect(first!.line).toBe(2);
  expect(first!.column).toBeGreaterThan(0);
  expect(first!.end_line ?? first!.line).toBeGreaterThanOrEqual(first!.line);
});

test("check: a clean buffer reports nothing", async () => {
  const { engine, events } = await session();
  await engine.receive({
    type: "check",
    files: [{ name: "main.gr", text: "def main()\n  print 1\nend\n" }],
    entry: "main.gr",
    lang: "gr",
  });
  expect(diagnosticsOf(events, "checked")).toEqual([]);
});

test("check: leaves the loaded program alone", async () => {
  const { engine, events } = await session();
  await engine.receive({
    type: "build",
    files: [{ name: "main.gr", text: "def main()\n  print 7\nend\n" }],
    entry: "main.gr",
    lang: "gr",
  });
  // A keystroke runs a check; it must not disturb a paused program.
  await engine.receive({
    type: "check",
    files: [{ name: "main.gr", text: "def main()\n  print oops\nend\n" }],
    entry: "main.gr",
    lang: "gr",
  });
  await engine.receive({ type: "run" });

  const output = events.filter((e) => e.type === "output").map((e) => e.text).join("");
  expect(output).toContain("7");
});

test("build: an asm error reports a point, which a marker still covers", async () => {
  const { engine, events } = await session();
  await engine.receive({
    type: "build",
    files: [{ name: "main.gas", text: "start:\n  mov $0041, nosuchreg\n  hlt\n" }],
    entry: "main.gas",
    lang: "gas",
  });

  const diagnostics = diagnosticsOf(events, "built");
  expect(diagnostics.length).toBeGreaterThan(0);
  // Asm carries no end column; the editor marks to the end of the line
  // rather than dropping the diagnostic for want of a width.
  expect(diagnostics[0]!.end_col).toBeUndefined();
  expect(diagnostics[0]!.line).toBe(2);
});
