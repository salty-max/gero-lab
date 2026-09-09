/**
 * The cockpit's view of the machine.
 *
 * The source application drove a TypeScript VM through comlink. This
 * keeps the same surface — the components are written against it — and
 * fills it from the worker instead, so every value here originated in
 * `gero.wasm` (§11).
 *
 * What is gone rather than stubbed: `setEntry` / `getEntry`, because a
 * `.gx` carries its own entry point and the module honours it, and
 * `peekMask`, because the module maps the whole 64 KiB and has no
 * notion of an unmapped byte to report.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { fmt16 } from "@/lib/format";
import type { Ev, Fault, RegName, Snapshot } from "@/lib/protocol";
import { EngineClient } from "@/worker/client";
import {
  DEFAULT_SLICE_BUDGET,
  REGISTER_NAMES,
  type Diagnostic,
  type Event,
  type Lang,
  type Registers,
  type SourceFile,
} from "@/worker/protocol";

/** What a `build` resolves to: the `built` event, plus the `program`
 *  event that follows a successful one. */
export interface BuildResult {
  ok: boolean;
  image?: Uint8Array;
  diagnostics: Diagnostic[];
  disassembly: string;
  debugJson: string | null;
}

type EvHandler = (ev: Ev) => void;

const snapshotOf = (regs: Registers): Snapshot => ({
  regs,
  ip: regs.ip,
  sp: regs.sp,
  fp: regs.fp,
});

/**
 * The slice budget each speed setting runs at.
 *
 * §3: "At the lowest setting one instruction per turn drives the
 * step-through visualization; at the highest the loop runs
 * uninterrupted until a breakpoint, fault, or `hlt`." The source
 * application spoke in milliseconds of delay; the worker's back-pressure
 * is a budget, so the control maps onto that instead of onto a sleep.
 */
const SLICE_BUDGETS = [1, 8, 64, 1024, 16_384, DEFAULT_SLICE_BUDGET] as const;

export function useVMService() {
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const lastFaultRef = useRef<Fault | null>(null);
  const listeners = useRef(new Map<Ev["t"], Set<EvHandler>>());
  const client = useRef<EngineClient | null>(null);
  /** Lets the commands below log alongside the worker's own events. */
  const emitRef = useRef<((ev: Ev) => void) | null>(null);
  const sliceBudget = useRef<number>(DEFAULT_SLICE_BUDGET);
  const breakpoints = useRef<number[]>([]);
  /** The last register file seen, for the events the worker reports as
   *  a value rather than as a change. */
  const lastRegs = useRef<Registers | null>(null);
  /** Set while a `load` is in flight, so the boot snapshot that follows
   *  it can report the entry point the image actually started at. */
  const pendingLoad = useRef<number | null>(null);

  useEffect(() => {
    const emit = (ev: Ev) => {
      listeners.current.get(ev.t)?.forEach((fn) => {
        fn(ev);
      });
    };
    emitRef.current = emit;

    const worker = new Worker(new URL("../worker/engine.worker.ts", import.meta.url), {
      type: "module",
    });
    const engine = new EngineClient(worker);
    client.current = engine;

    engine.on("*", (event) => {
      switch (event.type) {
        case "snapshot": {
          const previous = lastRegs.current;
          lastRegs.current = event.regs;
          setSnap(snapshotOf(event.regs));
          emit({ t: "snapshot", snap: snapshotOf(event.regs) });
          // The module reports the mask as a value; the change is the
          // thing worth logging, and two reported values give it.
          if (previous && previous.im !== event.regs.im) {
            emit({ t: "im", from: previous.im, to: event.regs.im });
          }
          if (pendingLoad.current !== null) {
            emit({ t: "load", start: 0, size: pendingLoad.current, entry: event.regs.ip });
            pendingLoad.current = null;
          }
          break;
        }
        case "paused":
          setRunning(false);
          if (event.reason === "fault") {
            lastFaultRef.current = {
              msg: `fault ${fmt16(event.fault ?? 0)}`,
              code: String(event.fault ?? 0),
              meta: { ip: event.ip },
            };
          }
          emit({
            t: "paused",
            reason: event.reason,
            ip: event.ip,
            ...(event.reason === "fault" && lastFaultRef.current
              ? { fault: lastFaultRef.current }
              : {}),
          });
          break;
        case "trace":
          setRunning(true);
          emit({ t: "tick", ip: event.ip });
          break;
        case "mem":
          emit({ t: "mem", addr: event.addr, data: event.bytes });
          break;
        case "output":
          emit({ t: "output", text: event.text });
          break;
        case "bp": {
          const before = breakpoints.current;
          breakpoints.current = event.addrs;
          emit({
            t: "bp",
            add: event.addrs.filter((a) => !before.includes(a)),
            remove: before.filter((a) => !event.addrs.includes(a)),
            total: event.addrs.length,
          });
          break;
        }
        case "irq":
          emit({ t: "irq", vector: event.vector, ip: lastRegs.current?.ip ?? 0 });
          break;
        case "error":
          emit({ t: "error", msg: event.message });
          break;
        default:
          break;
      }
    });

    engine
      .connect()
      .then(() => {
        setReady(true);
        emit({ t: "ready" });
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : String(err));
      });

    return () => {
      engine.terminate();
      client.current = null;
    };
  }, []);

  const on = useCallback(
    <T extends Ev["t"]>(t: T, fn: (ev: Extract<Ev, { t: T }>) => void) => {
      const set = listeners.current.get(t) ?? new Set<EvHandler>();
      set.add(fn as EvHandler);
      listeners.current.set(t, set);
      return () => set.delete(fn as EvHandler);
    },
    [],
  );

  /**
   * Build the file set, and resolve once the worker has answered.
   *
   * The worker loads a successful build itself, so what comes back is
   * already what the VM holds: the image, the diagnostics, and the
   * disassembly and debug tables of the program now loaded.
   */
  const build = useCallback(
    (files: SourceFile[], entry: string, lang: Lang) =>
      new Promise<BuildResult>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        let built: Extract<Event, { type: "built" }> | null = null;
        const offBuilt = engine.on("built", (event) => {
          built = event;
          // A failed build sends no `program`, so it answers here.
          if (!event.ok) {
            offBuilt();
            offProgram();
            resolve({ ...event, disassembly: "", debugJson: null });
          }
        });
        const offProgram = engine.on("program", (event) => {
          offBuilt();
          offProgram();
          resolve({
            ok: true,
            ...(built?.image ? { image: built.image } : {}),
            diagnostics: built?.diagnostics ?? [],
            disassembly: event.disassembly,
            debugJson: event.debugJson,
          });
        });
        engine.send({ type: "build", files, entry, lang });
      }),
    [],
  );

  /** Take a built image straight into the VM. Building is the program
   *  context's job; this is the half that runs one. */
  const load = useCallback((image: Uint8Array) => {
    pendingLoad.current = image.length;
    client.current?.send({ type: "load", image });
  }, []);

  const run = useCallback(() => {
    // Optimistic, so Pause enables before the first slice reports.
    setRunning(true);
    emitRef.current?.({ t: "run", ip: lastRegs.current?.ip ?? 0 });
    client.current?.send({ type: "run", sliceBudget: sliceBudget.current });
  }, []);

  const pause = useCallback(() => {
    client.current?.send({ type: "pause" });
  }, []);

  const step = useCallback((count = 1) => {
    client.current?.send({ type: "step", count });
  }, []);

  const reset = useCallback(() => {
    client.current?.send({ type: "reset" });
  }, []);

  const setBreakpoints = useCallback((addrs: number[]) => {
    client.current?.send({ type: "breakpoints", addrs });
  }, []);

  const getBreakpoints = useCallback(() => breakpoints.current, []);

  const setReg = useCallback((reg: RegName, value: number) => {
    const index = REGISTER_NAMES.indexOf(reg);
    if (index === -1) return;
    client.current?.send({ type: "setReg", index, value });
  }, []);

  /** How many speed settings the control offers, and where it sits. */
  const speedSteps = SLICE_BUDGETS.length;
  const setSpeed = useCallback((step_: number) => {
    sliceBudget.current = SLICE_BUDGETS[Math.min(Math.max(step_, 0), SLICE_BUDGETS.length - 1)]!;
  }, []);
  const getSpeed = useCallback(
    () => SLICE_BUDGETS.indexOf(sliceBudget.current as (typeof SLICE_BUDGETS)[number]),
    [],
  );

  /**
   * Read memory, resolving with the bytes.
   *
   * The worker answers a peek with a `mem` event rather than a return
   * value, so this waits for the one that names the address it asked
   * for — two panes reading different windows must not take each
   * other's answer.
   */
  const peek = useCallback(
    (addr: number, len: number) =>
      new Promise<Uint8Array>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        const off = engine.on("mem", (event) => {
          if (event.addr !== addr) return;
          off();
          resolve(event.bytes);
        });
        engine.send({ type: "peek", addr, len });
      }),
    [],
  );

  /** The address space the ISA defines. Flat and wholly mapped, which
   *  is why nothing here reports an unmapped byte. */
  const memSize = useCallback(() => Promise.resolve(0x1_0000), []);

  const poke = useCallback((addr: number, data: Uint8Array) => {
    emitRef.current?.({ t: "poke", addr, len: data.length });
    client.current?.send({ type: "poke", addr, bytes: data });
    toast.success(`Wrote ${String(data.length)} byte${data.length === 1 ? "" : "s"} @ ${fmt16(addr)}`);
  }, []);

  const pokeMany = useCallback((segs: { addr: number; data: Uint8Array }[]) => {
    for (const seg of segs) client.current?.send({ type: "poke", addr: seg.addr, bytes: seg.data });
    const total = segs.reduce((n, s) => n + s.data.length, 0);
    toast.success(
      `Wrote ${String(total)} bytes in ${String(segs.length)} segment${segs.length === 1 ? "" : "s"}`,
    );
  }, []);

  const raiseIrq = useCallback((vector: number) => {
    client.current?.send({ type: "irq", vector });
  }, []);

  /** The program's battery-backed banks, and restoring them.
   *
   *  The read is answered by an `sram` event, so it resolves on the one
   *  that comes back rather than returning a value. */
  const readSram = useCallback(
    () =>
      new Promise<Uint8Array>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        const off = engine.on("sram", (event) => {
          off();
          resolve(event.bytes);
        });
        engine.send({ type: "sram" });
      }),
    [],
  );

  const writeSram = useCallback((bytes: Uint8Array) => {
    client.current?.send({ type: "loadSram", bytes });
  }, []);

  return {
    ready,
    running,
    snap,
    build,
    lastFaultRef,
    on,
    load,
    run,
    pause,
    step,
    reset,
    setBreakpoints,
    getBreakpoints,
    setReg,
    setSpeed,
    getSpeed,
    speedSteps,
    peek,
    memSize,
    poke,
    pokeMany,
    raiseIrq,
    readSram,
    writeSram,
    send: (command: Parameters<EngineClient["send"]>[0]) => client.current?.send(command),
  };
}
