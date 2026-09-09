/**
 * The UI's view of the session.
 *
 * Every field here arrives as a worker event; nothing is computed from
 * the program's semantics on this side. That is §11's rule expressed as
 * a data structure — if a value is not in an event, the UI does not
 * know it, and the fix is a worker change rather than a TypeScript
 * reimplementation of whatever produced it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EngineClient } from "../worker/client.js";
import { NO_DEBUG_INFO, parseDebugInfo, type DebugInfo } from "../worker/debug.js";
import type {
  Command,
  Diagnostic,
  Lang,
  PauseReason,
  Registers,
  SourceFile,
} from "../worker/protocol.js";

export type Phase = "connecting" | "idle" | "running" | "paused" | "failed";

export interface SessionState {
  phase: Phase;
  /** The module's own version string, from `ready`. */
  moduleVersion: string;
  /** Set when the worker could not be reached or spoke a protocol this
   *  build does not know. The UI shows this instead of a dead cockpit. */
  connectionError: string | null;
  diagnostics: Diagnostic[];
  regs: Registers | null;
  output: string;
  disassembly: string;
  debug: DebugInfo;
  pause: { reason: PauseReason; ip: number; fault?: number } | null;
  breakpoints: number[];
  memory: { addr: number; bytes: Uint8Array } | null;
  /** The banks the loaded program declares, as of the last `readSram`.
   *  Empty for a program that declares none, which is most of them. */
  sram: Uint8Array;
}

const EMPTY: SessionState = {
  phase: "connecting",
  moduleVersion: "",
  connectionError: null,
  diagnostics: [],
  regs: null,
  output: "",
  disassembly: "",
  debug: NO_DEBUG_INFO,
  pause: null,
  breakpoints: [],
  memory: null,
  sram: new Uint8Array(0),
};

export interface Session extends SessionState {
  build(files: SourceFile[], entry: string, lang: Lang): void;
  check(files: SourceFile[], entry: string, lang: Lang): void;
  run(): void;
  pauseRun(): void;
  step(count?: number): void;
  reset(): void;
  setBreakpoints(addrs: number[]): void;
  peek(addr: number, len: number): void;
  poke(addr: number, bytes: Uint8Array): void;
  setReg(index: number, value: number): void;
  raiseIrq(vector: number): void;
  readSram(): void;
  writeSram(bytes: Uint8Array): void;
  clearOutput(): void;
}

/** Spawn the worker, connect, and expose the session.
 *
 *  The worker is created once for the lifetime of the page: it owns the
 *  VM and the module's arena, and tearing it down to rebuild would drop
 *  breakpoints and history the user set. */
export function useSession(): Session {
  const [state, setState] = useState<SessionState>(EMPTY);
  const clientRef = useRef<EngineClient | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../worker/engine.worker.ts", import.meta.url), {
      type: "module",
    });
    const client = new EngineClient(worker);
    clientRef.current = client;

    client.on("*", (event) => {
      setState((prev) => {
        switch (event.type) {
          case "built":
            return {
              ...prev,
              diagnostics: event.diagnostics,
              // A failed build leaves the previous program loaded; the
              // diagnostics say why nothing changed.
              ...(event.ok ? { output: "", pause: null } : {}),
            };
          case "checked":
            return { ...prev, diagnostics: event.diagnostics };
          case "program":
            return {
              ...prev,
              disassembly: event.disassembly,
              debug: parseDebugInfo(event.debugJson),
            };
          case "snapshot":
            return { ...prev, regs: event.regs };
          case "paused":
            return {
              ...prev,
              phase: "paused",
              pause: { reason: event.reason, ip: event.ip, ...(event.fault ? { fault: event.fault } : {}) },
            };
          case "trace":
            // One per slice, and it carries nothing the cockpit shows.
            // Returning `prev` unchanged is what keeps a spinning
            // program from re-rendering the whole cockpit at slice
            // rate — the back-pressure the worker provides is only half
            // the story if the UI spends it on renders.
            return prev.phase === "running" ? prev : { ...prev, phase: "running" };
          case "output":
            return { ...prev, output: prev.output + event.text };
          case "mem":
            return { ...prev, memory: { addr: event.addr, bytes: event.bytes } };
          case "bp":
            return { ...prev, breakpoints: event.addrs };
          case "sram":
            return { ...prev, sram: event.bytes };
          case "error":
            // A command that failed is not a dead session: the message
            // goes to the log and the cockpit stays usable.
            return { ...prev, output: `${prev.output}\n[error] ${event.message}\n` };
          default:
            return prev;
        }
      });
    });

    client
      .connect()
      .then((version) => setState((p) => ({ ...p, phase: "idle", moduleVersion: version })))
      .catch((err: unknown) =>
        setState((p) => ({
          ...p,
          phase: "failed",
          connectionError: err instanceof Error ? err.message : String(err),
        })),
      );

    return () => {
      client.terminate();
      clientRef.current = null;
    };
  }, []);

  const send = useCallback((command: Command) => clientRef.current?.send(command), []);

  const actions = useMemo(
    () => ({
      build: (files: SourceFile[], entry: string, lang: Lang) =>
        send({ type: "build", files, entry, lang }),
      check: (files: SourceFile[], entry: string, lang: Lang) =>
        send({ type: "check", files, entry, lang }),
      run: () => {
        setState((p) => ({ ...p, phase: "running", pause: null }));
        send({ type: "run" });
      },
      pauseRun: () => send({ type: "pause" }),
      step: (count?: number) => send({ type: "step", ...(count ? { count } : {}) }),
      reset: () => send({ type: "reset" }),
      setBreakpoints: (addrs: number[]) => send({ type: "breakpoints", addrs }),
      peek: (addr: number, len: number) => send({ type: "peek", addr, len }),
      poke: (addr: number, bytes: Uint8Array) => send({ type: "poke", addr, bytes }),
      setReg: (index: number, value: number) => send({ type: "setReg", index, value }),
      raiseIrq: (vector: number) => send({ type: "irq", vector }),
      readSram: () => send({ type: "sram" }),
      writeSram: (bytes: Uint8Array) => send({ type: "loadSram", bytes }),
      clearOutput: () => setState((p) => ({ ...p, output: "" })),
    }),
    [send],
  );

  return { ...state, ...actions };
}
