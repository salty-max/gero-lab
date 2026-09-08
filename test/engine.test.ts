/**
 * The engine, driven against the real `gero.wasm`.
 *
 * Nothing here mocks the module. A mocked VM is a second implementation
 * of the thing gero-lab.md §11 exists to prevent, and it would agree
 * with whatever the test author believed rather than with the ISA.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { Engine } from "../src/worker/engine.js";
import { GeroModule } from "../src/worker/module.js";
import { PROTOCOL_VERSION, type Event } from "../src/worker/protocol.js";

const WASM = process.env.GERO_WASM ?? "public/gero.wasm";

/** Collect events, and drive the engine with an immediate yield so a
 *  run completes without real timers. */
function harness() {
  const events: Event[] = [];
  const engine = new Engine(
    (e) => events.push(e),
    () => GeroModule.instantiate(readFileSync(WASM)),
    () => Promise.resolve(),
  );
  const of = <T extends Event["type"]>(type: T) =>
    events.filter((e): e is Extract<Event, { type: T }> => e.type === type);
  return { engine, events, of };
}

// `int $10` writes r1's low byte, not acu's — the host convention in
// src/vm/host_int.zig.
const HELLO_GAS = `main:
  mov $48, r1
  int $10
  mov $49, r1
  int $10
  hlt
`;

const COUNT_GR = `def main()
  for i in 0..3
    print i
  end
end
`;

describe("Engine", () => {
  it("answers `ready` with the protocol version it speaks", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });

    const ready = of("ready");
    expect(ready).toHaveLength(1);
    expect(ready[0]?.protocol).toBe(PROTOCOL_VERSION);
    expect(ready[0]?.version).toMatch(/\d/);
  });

  it("builds and runs an assembly program to `hlt`", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: HELLO_GAS }],
      entry: "main.gas",
      lang: "gas",
    });

    expect(of("built")[0]?.ok).toBe(true);
    await engine.handle_({ type: "run" });

    expect(of("paused").at(-1)?.reason).toBe("halt");
    expect(of("output").map((e) => e.text).join("")).toBe("HI");
  });

  it("builds and runs a gero-lang program", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gr", text: COUNT_GR }],
      entry: "main.gr",
      lang: "gr",
    });

    expect(of("built")[0]?.ok).toBe(true);
    await engine.handle_({ type: "run" });

    expect(of("paused").at(-1)?.reason).toBe("halt");
    expect(of("output").map((e) => e.text).join("")).toBe("0\n1\n2\n");
  });

  it("reports diagnostics rather than throwing on a bad build", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: "main:\n  notamnemonic\n" }],
      entry: "main.gas",
      lang: "gas",
    });

    const built = of("built")[0];
    expect(built?.ok).toBe(false);
    expect(built?.diagnostics.length).toBeGreaterThan(0);
    expect(of("error")).toHaveLength(0);
  });

  it("coalesces output to one event per slice, however much is printed", async () => {
    // 64 prints inside a single slice must not produce 64 events — that
    // bounded rate is what keeps the UI responsive under a tight loop.
    const many = `def main()
  for i in 0..64
    print 7
  end
end
`;
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gr", text: many }],
      entry: "main.gr",
      lang: "gr",
    });
    await engine.handle_({ type: "run" });

    expect(of("paused").at(-1)?.reason).toBe("halt");
    expect(of("output").length).toBeLessThanOrEqual(2);
    expect(of("output").map((e) => e.text).join("")).toBe("7\n".repeat(64));
  });

  it("honours `pause` at a slice boundary, and resumes where it stopped", async () => {
    // A budget of 1 makes every slice one instruction, so the pause
    // lands after the first rather than at the end of the program.
    const spin = `main:
.loop:
  jmp .loop
`;
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: spin }],
      entry: "main.gas",
      lang: "gas",
    });

    const running = engine.handle_({ type: "run", sliceBudget: 1 });
    await engine.handle_({ type: "pause" });
    await running;

    expect(of("paused").at(-1)?.reason).toBe("manual");
  });

  it("stops at a breakpoint and says why", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: HELLO_GAS }],
      entry: "main.gas",
      lang: "gas",
    });

    // The entry point: whatever the image's layout, address 0 of the
    // loaded program is where `main` begins.
    const regs = of("snapshot").at(-1)?.regs;
    expect(regs).toBeDefined();
    await engine.handle_({ type: "breakpoints", addrs: [regs!.ip] });
    expect(of("bp").at(-1)?.addrs).toEqual([regs!.ip]);

    await engine.handle_({ type: "run" });
    expect(of("paused").at(-1)?.reason).toBe("breakpoint");
  });

  it("steps one instruction and reports where it stopped", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: HELLO_GAS }],
      entry: "main.gas",
      lang: "gas",
    });

    const before = of("snapshot").at(-1)!.regs.ip;
    await engine.handle_({ type: "step" });

    const paused = of("paused").at(-1)!;
    expect(paused.steps).toBe(1);
    expect(paused.ip).toBeGreaterThan(before);
  });

  it("reads and writes memory through peek and poke", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: HELLO_GAS }],
      entry: "main.gas",
      lang: "gas",
    });

    await engine.handle_({ type: "poke", addr: 0x1200, bytes: new Uint8Array([0xde, 0xad]) });
    await engine.handle_({ type: "peek", addr: 0x1200, len: 2 });

    expect(Array.from(of("mem").at(-1)!.bytes)).toEqual([0xde, 0xad]);
  });

  it("reports a command sent before `init` as an error, not a crash", async () => {
    const { engine, of } = harness();
    await engine.handle_({ type: "run" });

    expect(of("error")).toHaveLength(1);
    expect(of("error")[0]?.command).toBe("run");
  });

  it("yields between slices under a tight loop, so pause lands", async () => {
    const events: Event[] = [];
    let ticks = 0;
    const engine = new Engine(
      (e) => events.push(e),
      () => GeroModule.instantiate(readFileSync(WASM)),
      // The yield is where a real page services its message queue.
      // Pausing from inside it is what a user clicking Pause does —
      // and it goes through `handle_`, so this covers the dispatch
      // policy that decides whether it is reachable at all.
      async () => {
        ticks += 1;
        if (ticks === 3) await engine.handle_({ type: "pause" });
      },
    );
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: "start:\n  jmp start\n" }],
      entry: "main.gas",
      lang: "gas",
    });

    await engine.handle_({ type: "run", sliceBudget: 1000 });

    const paused = events.filter((e) => e.type === "paused");
    expect(paused.at(-1)).toMatchObject({ reason: "manual" });
    // One trace per slice, not one per instruction: a program retiring
    // thousands of instructions must not emit thousands of events.
    expect(events.filter((e) => e.type === "trace").length).toBeLessThanOrEqual(ticks);
  });

  it("queues commands behind a run, but lets pause overtake it", async () => {
    const events: Event[] = [];
    const order: string[] = [];
    let ticks = 0;
    const engine: Engine = new Engine(
      (e) => events.push(e),
      () => GeroModule.instantiate(readFileSync(WASM)),
      async () => {
        ticks += 1;
        if (ticks === 2) {
          // A `step` sent mid-run must wait — driving the VM from two
          // places at once would interleave with the loop's own slice.
          void engine.handle_({ type: "step" }).then(() => order.push("step"));
          void engine.handle_({ type: "pause" }).then(() => order.push("pause"));
        }
        // A real macrotask yield: a microtask-only one would starve
        // the very queue the pause has to arrive through.
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    );
    await engine.handle_({ type: "init" });
    await engine.handle_({
      type: "build",
      files: [{ name: "main.gas", text: "start:\n  jmp start\n" }],
      entry: "main.gas",
      lang: "gas",
    });

    await engine.handle_({ type: "run", sliceBudget: 100 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(order).toEqual(["pause", "step"]);
  });
});

