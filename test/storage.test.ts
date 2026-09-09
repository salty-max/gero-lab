import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { Persistence, type KeyValueStore, type WorkingSet } from "../src/state/storage.js";
import { Engine } from "../src/worker/engine.js";
import { GeroModule } from "../src/worker/module.js";
import type { Event } from "../src/worker/protocol.js";

const WASM = process.env.GERO_WASM ?? "public/gero.wasm";

/** A store backed by a map, so this needs no browser. */
function mapStore(): KeyValueStore & { size(): number } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    size: () => map.size,
  };
}

const SET: WorkingSet = {
  sample: "banks",
  entry: "main.gas",
  lang: "gas",
  files: [
    { name: "main.gas", text: "main:\n  hlt\n" },
    { name: "bank0.gas", text: "bank $00\ngreet:\n  ret\n" },
  ],
  open: "bank0.gas",
};

describe("the working set", () => {
  it("survives closing and reopening the tab", () => {
    const store = mapStore();
    new Persistence(store).saveWorkingSet(SET);

    // A new Persistence over the same store is what a reload is.
    expect(new Persistence(store).loadWorkingSet()).toEqual(SET);
  });

  it("reads nothing rather than throwing when the store holds junk", () => {
    const store = mapStore();
    store.setItem("gero-lab:working-set", "{not json");
    expect(new Persistence(store).loadWorkingSet()).toBeNull();

    // Valid JSON of the wrong shape is the same case: an older build
    // wrote it, and the lab still has to open.
    store.setItem("gero-lab:working-set", JSON.stringify({ files: "nope" }));
    expect(new Persistence(store).loadWorkingSet()).toBeNull();
  });

  it("keeps working when the store refuses to write", () => {
    const refusing: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => undefined,
    };
    // The work in front of the user is still there; it just will not
    // survive the tab.
    expect(() => new Persistence(refusing).saveWorkingSet(SET)).not.toThrow();
  });
});

describe("session state", () => {
  it("round-trips breakpoints and defaults to none", () => {
    const store = mapStore();
    const persistence = new Persistence(store);
    expect(persistence.loadSession()).toEqual({ breakpoints: [] });

    persistence.saveSession({ breakpoints: [0x1200, 0x1258] });
    expect(new Persistence(store).loadSession().breakpoints).toEqual([0x1200, 0x1258]);
  });
});

describe("SRAM", () => {
  it("is stored per program, so another program does not see it", () => {
    const store = mapStore();
    const persistence = new Persistence(store);
    persistence.saveSram("save.gas", new Uint8Array([1, 2, 3]));

    expect(persistence.loadSram("save.gas")).toEqual(new Uint8Array([1, 2, 3]));
    expect(persistence.loadSram("fizzbuzz.gr")).toBeNull();
  });

  it("keeps no entry for a program that declares none", () => {
    const store = mapStore();
    const persistence = new Persistence(store);
    persistence.saveSram("main.gas", new Uint8Array([1]));
    persistence.saveSram("main.gas", new Uint8Array(0));

    // An empty entry would read as a save on the next load.
    expect(persistence.loadSram("main.gas")).toBeNull();
    expect(store.size()).toBe(0);
  });
});

describe("SRAM through the module", () => {
  /** `save.gas` from the example corpus, trimmed to what this needs:
   *  the last `sram_banks` banks are battery-backed, so with one bank
   *  declared, bank 0 is the SRAM bank and the window at `&C000`
   *  writes into it. `int $21` asks the host to persist. */
  const SAVE_GAS = `sram_banks $01

main:
  mov $00, mb
  mov 'S', r1
  mov r1, &C000
  mov 'A', r1
  mov r1, &C001
  mov 'V', r1
  mov r1, &C002
  int $21
  hlt

bank $00
`;

  async function run(source: string, restore?: Uint8Array) {
    const events: Event[] = [];
    const engine = new Engine(
      (e) => events.push(e),
      () => GeroModule.instantiate(readFileSync(WASM)),
      () => Promise.resolve(),
    );
    await engine.receive({ type: "init" });
    await engine.receive({
      type: "build",
      files: [{ name: "main.gas", text: source }],
      entry: "main.gas",
      lang: "gas",
    });
    if (restore) await engine.receive({ type: "loadSram", bytes: restore });
    await engine.receive({ type: "run" });
    await engine.receive({ type: "sram" });
    const sram = events.findLast((e) => e.type === "sram");
    return { engine, events, sram: sram?.bytes ?? new Uint8Array(0) };
  }

  it("reads back what a program wrote to its banks", async () => {
    const { sram } = await run(SAVE_GAS);
    expect(sram.length).toBeGreaterThan(0);
    expect(String.fromCharCode(...sram.slice(0, 3))).toBe("SAV");
  });

  it("restores banks a previous session saved", async () => {
    const first = await run(SAVE_GAS);
    // A byte the program never writes: if it survives the next run,
    // the restore reached the banks rather than the boot zeroing them.
    const saved = new Uint8Array(first.sram);
    saved[0x40] = 0x99;

    const { sram } = await run(SAVE_GAS, saved);
    expect(sram[0x40]).toBe(0x99);
  });

  it("refuses a save that does not fit this program's banks", async () => {
    const { events } = await run(SAVE_GAS, new Uint8Array([1, 2, 3]));
    // The module checks the length, which is what keeps one program's
    // save out of another's banks even if a key ever collided.
    expect(events.some((e) => e.type === "error" && e.command === "loadSram")).toBe(true);
  });
});
