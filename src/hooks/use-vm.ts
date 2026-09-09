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
  disassemblyWithBytes: string;
  debugJson: string | null;
}

type EvHandler = (ev: Ev) => void;

/** Where the toolbar's delay slider sits before it is touched. */
export const DEFAULT_STEP_DELAY_MS = 500;

const snapshotOf = (regs: Registers): Snapshot => ({
  regs,
  ip: regs.ip,
  sp: regs.sp,
  fp: regs.fp,
});

export function useVMService() {
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [breakpointList, setBreakpointList] = useState<number[]>([]);
  const lastFaultRef = useRef<Fault | null>(null);
  const listeners = useRef(new Map<Ev["t"], Set<EvHandler>>());
  const client = useRef<EngineClient | null>(null);
  /** Lets the commands below log alongside the worker's own events. */
  const emitRef = useRef<((ev: Ev) => void) | null>(null);
  const sliceBudget = useRef<number>(DEFAULT_SLICE_BUDGET);
  /** How long the run loop waits between slices, matching where the
   *  toolbar's slider starts. The source application's control, and the
   *  module honours it directly. */
  const stepDelay = useRef(DEFAULT_STEP_DELAY_MS);
  /** The set the worker has confirmed, which is what a change is
   *  reported against. */
  const breakpoints = useRef<number[]>([]);
  /** The set that has been asked for. A toggle flips this rather than
   *  the confirmed one, so two clicks in one frame do not both toggle
   *  from the same starting set. */
  const wantedBreakpoints = useRef<number[]>([]);
  /** Numbers a peek's answer back to its request. */
  const peekId = useRef(0);
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
          wantedBreakpoints.current = event.addrs;
          setBreakpointList(event.addrs);
          const add = event.addrs.filter((a) => !before.includes(a));
          const remove = before.filter((a) => !event.addrs.includes(a));
          if (add.length > 0 || remove.length > 0) {
            emit({ t: "bp", add, remove, total: event.addrs.length });
          }
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
          // A build is something the user asked for, so what it reports
          // belongs in the console. A `check` runs on every idle and
          // would say the same thing over and over; the editor's
          // markers carry that one.
          for (const d of event.diagnostics) {
            emitRef.current?.({
              t: "diagnostic",
              severity: d.severity,
              ...(d.code === undefined ? {} : { code: d.code }),
              file: d.file,
              line: d.line,
              column: d.column,
              message: d.message,
              ...(d.note === undefined ? {} : { note: d.note }),
            });
          }
          // A failed build sends no `program`, so it answers here.
          if (!event.ok) {
            offBuilt();
            offProgram();
            resolve({ ...event, disassembly: "", disassemblyWithBytes: "", debugJson: null });
          }
        });
        const offProgram = engine.on("program", (event) => {
          offBuilt();
          offProgram();
          if (built?.image) pendingLoad.current = built.image.length;
          resolve({
            ok: true,
            ...(built?.image ? { image: built.image } : {}),
            diagnostics: built?.diagnostics ?? [],
            disassembly: event.disassembly,
            disassemblyWithBytes: event.disassemblyWithBytes,
            debugJson: event.debugJson,
          });
        });
        engine.send({ type: "build", files, entry, lang });
      }),
    [],
  );

  /** Diagnostics for the buffer as it stands, without building it.
   *
   *  The editor's fast path: it runs on every edit and touches neither
   *  the loaded image nor the VM, so a keystroke cannot disturb a
   *  paused program. */
  const check = useCallback(
    (files: SourceFile[], entry: string, lang: Lang) =>
      new Promise<Diagnostic[]>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        const off = engine.on("checked", (event) => {
          off();
          resolve(event.diagnostics);
        });
        engine.send({ type: "check", files, entry, lang });
      }),
    [],
  );

  /** Canonical formatting of one buffer. Null when it does not parse. */
  const format = useCallback(
    (source: string, lang: Lang) =>
      new Promise<string | null>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        const requestId = ++peekId.current;
        const off = engine.on("formatted", (event) => {
          if (event.requestId !== requestId) return;
          off();
          resolve(event.text);
        });
        engine.send({ type: "format", source, lang, requestId });
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
    client.current?.send({
      type: "run",
      sliceBudget: stepDelay.current > 0 ? 1 : sliceBudget.current,
      stepDelayMs: stepDelay.current,
    });
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
    wantedBreakpoints.current = addrs;
    client.current?.send({ type: "breakpoints", addrs });
  }, []);

  /** Flip one address in the set, wherever it was named from — a
   *  disassembly row or a source line reach the same set. */
  const toggleBreakpoint = useCallback((addr: number) => {
    const current = wantedBreakpoints.current;
    const next = current.includes(addr)
      ? current.filter((a) => a !== addr)
      : [...current, addr].toSorted((a, b) => a - b);
    wantedBreakpoints.current = next;
    client.current?.send({ type: "breakpoints", addrs: next });
  }, []);

  const setReg = useCallback((reg: RegName, value: number) => {
    const index = REGISTER_NAMES.indexOf(reg);
    if (index === -1) return;
    client.current?.send({ type: "setReg", index, value });
  }, []);

  /** A delay above zero drops the slice to one instruction, so the
   *  wait is per instruction the way the control reads. */
  const setStepDelay = useCallback((ms: number) => {
    stepDelay.current = Math.max(0, ms);
  }, []);
  const getStepDelay = useCallback(() => stepDelay.current, []);

  /**
   * Read memory, resolving with the bytes.
   *
   * The worker answers a peek with a `mem` event rather than a return
   * value, so each request carries an id the answer echoes. Matching on
   * the address alone is not enough: two panes reading the same address
   * with different lengths take each other's bytes.
   */
  const peek = useCallback(
    (addr: number, len: number) =>
      new Promise<Uint8Array>((resolve, reject) => {
        const engine = client.current;
        if (!engine) {
          reject(new Error("the engine is not connected"));
          return;
        }
        const requestId = ++peekId.current;
        const off = engine.on("mem", (event) => {
          if (event.requestId !== requestId) return;
          off();
          resolve(event.bytes);
        });
        engine.send({ type: "peek", addr, len, requestId });
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
    breakpoints: breakpointList,
    build,
    check,
    format,
    lastFaultRef,
    on,
    load,
    run,
    pause,
    step,
    reset,
    setBreakpoints,
    toggleBreakpoint,
    setReg,
    setStepDelay,
    getStepDelay,
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
