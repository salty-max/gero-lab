/**
 * The shapes the cockpit's components read.
 *
 * The source application defined these over its own TypeScript VM.
 * They stay because the components are written against them; what
 * changed is where they come from — `hooks/use-vm` now fills them from
 * the worker, and every value in them originated in `gero.wasm`.
 */

import { REGISTER_NAMES } from "@/worker/protocol";

export type RegName = (typeof REGISTER_NAMES)[number];

export type RegisterFile = { [K in RegName]: number };

export type Snapshot = {
  regs: RegisterFile;
  ip: RegisterFile["ip"];
  sp: RegisterFile["sp"];
  fp: RegisterFile["fp"];
};

/** Why a program stopped badly, in the words the module used. */
export type Fault = {
  msg: string;
  code?: string;
  meta?: Record<string, unknown>;
};

/** What the cockpit listens for. A subset of the source application's
 *  event set: the ones with no counterpart in the worker protocol are
 *  gone rather than stubbed, since a listener for an event that can
 *  never arrive is a control that never lights up. */
export type Ev =
  | { t: "ready" }
  | { t: "paused"; reason: "breakpoint" | "manual" | "fault" | "halt"; ip: number; fault?: Fault }
  | { t: "tick"; ip: number }
  | { t: "snapshot"; snap: Snapshot }
  | { t: "mem"; addr: number; data: Uint8Array }
  | { t: "poke"; addr: number; len: number }
  | { t: "output"; text: string }
  | { t: "error"; msg: string }
  | { t: "bp"; add: number[]; remove: number[]; total: number }
  | { t: "run"; ip: number }
  | { t: "load"; start: number; size: number; entry: number }
  | { t: "irq"; vector: number; ip: number }
  | { t: "im"; from: number; to: number };
