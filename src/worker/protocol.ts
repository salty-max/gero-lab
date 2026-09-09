/**
 * The worker boundary (gero-lab.md §3).
 *
 * The UI owns nothing but the messages in this file: plain, structured-
 * cloneable values. Every VM instance and every allocation inside the
 * wasm module belongs to the worker, which is what keeps the run loop
 * off the main thread — a tight `while` in a user program cannot freeze
 * the page.
 */

/**
 * Bumped whenever a command or event changes shape. The UI refuses to
 * connect to a worker it does not recognize, which turns a stale
 * service-worker cache — the classic way a deployed web app breaks
 * after a release — into a clear error rather than silent misbehaviour.
 */
export const PROTOCOL_VERSION = 3;

/** Which front-end a source file belongs to. Mirrors the module's `lang`. */
export type Lang = "gas" | "gr";

/** Why the VM stopped. The UI behaves differently for each, so it is
 *  carried rather than inferred after the fact. */
export type PauseReason = "breakpoint" | "manual" | "fault" | "halt";

/** One source buffer in the virtual file set (§4.2). */
export interface SourceFile {
  name: string;
  text: string;
}

/** A diagnostic, in the shape `gero check --format=json` emits. */
/** One diagnostic, in the shape the module emits — the same objects
 *  `gero check --format=json` writes, so the wording, code and span are
 *  identical in a terminal and here (§5).
 *
 *  `end_line` / `end_col` are present for gero-lang, whose diagnostics
 *  carry a span; asm reports a point, and a marker for one covers the
 *  rest of the line. */
export interface Diagnostic {
  code?: string;
  message: string;
  file: string;
  line: number;
  column: number;
  end_line?: number;
  end_col?: number;
  severity: "error" | "warning" | "note";
  /** The `help` line the CLI prints under the caret, when there is one. */
  note?: string;
}

/** The registers in the module's own index order, which is what
 *  `gero_vm_regs` returns them in. */
export const REGISTER_NAMES = [
  "ip", "acu", "r1", "r2", "r3", "r4", "r5", "r6",
  "r7", "r8", "sp", "fp", "mb", "im", "flg",
] as const;

/** The register file, in `Register` index order. */
export interface Registers {
  ip: number;
  acu: number;
  r1: number; r2: number; r3: number; r4: number;
  r5: number; r6: number; r7: number; r8: number;
  sp: number;
  fp: number;
  mb: number;
  im: number;
  flg: number;
}

// ---------- commands: UI → worker ----------

export type Command =
  /** Bring up the module. Must precede everything else. */
  | { type: "init"; arenaBytes?: number }
  /** Assemble or compile the file set; the entry names the root. */
  | { type: "build"; files: SourceFile[]; entry: string; lang: Lang }
  /** Diagnostics without an image — the editor's fast path (§2). Sent
   *  on every edit, so it never touches the loaded program. */
  | { type: "check"; files: SourceFile[]; entry: string; lang: Lang }
  /** Take `.gx` bytes directly, skipping the toolchain — how a shared
   *  image opens without recompiling. */
  | { type: "load"; image: Uint8Array }
  | { type: "reset" }
  /** Run until paused. `sliceBudget` overrides the default instruction
   *  budget per turn, and `stepDelayMs` waits that long between slices
   *  so a run can be watched rather than only measured. */
  | { type: "run"; sliceBudget?: number; stepDelayMs?: number }
  | { type: "pause" }
  | { type: "step"; count?: number }
  /** Replace the breakpoint set wholesale — idempotent, so the UI need
   *  not track what the worker already has. */
  | { type: "breakpoints"; addrs: number[] }
  | { type: "peek"; addr: number; len: number }
  | { type: "poke"; addr: number; bytes: Uint8Array }
  | { type: "setReg"; index: number; value: number }
  | { type: "irq"; vector: number }
  /** Read the program's battery-backed banks, for persisting them. */
  | { type: "sram" }
  /** Restore banks from an earlier session. The module refuses a save
   *  whose length does not match what the loaded program declares. */
  | { type: "loadSram"; bytes: Uint8Array };

export type CommandType = Command["type"];

// ---------- events: worker → UI ----------

export type Event =
  /** The module is up. `protocol` is checked by the client before any
   *  other event is trusted. */
  | { type: "ready"; protocol: number; version: string }
  | { type: "built"; ok: boolean; image?: Uint8Array; diagnostics: Diagnostic[] }
  /** The answer to a `check`. Separate from `built` so the editor's
   *  markers update on edit without the UI having to tell a build's
   *  diagnostics apart from a check's. */
  | { type: "checked"; diagnostics: Diagnostic[] }
  /** The disassembly and debug tables of the image just built. Sent
   *  only on success; `debugJson` is null for an image carrying no
   *  debug section, which the UI reports rather than hiding. */
  | { type: "program"; disassembly: string; debugJson: string | null }
  | { type: "paused"; reason: PauseReason; ip: number; fault?: number; steps: number }
  | { type: "snapshot"; regs: Registers }
  | { type: "mem"; addr: number; bytes: Uint8Array }
  | { type: "output"; text: string }
  | { type: "trace"; ip: number; steps: number }
  | { type: "irq"; vector: number }
  | { type: "bp"; addrs: number[] }
  /** The program's battery-backed banks. Empty when it declares none,
   *  which is most programs and not an error. */
  | { type: "sram"; bytes: Uint8Array }
  | { type: "error"; message: string; command?: CommandType };

export type EventType = Event["type"];

/** Raised when a worker answers with a protocol version this build does
 *  not speak. Carries both so the message can say which is stale. */
export class ProtocolMismatchError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(
      `worker speaks protocol ${actual}, this build speaks ${expected} — ` +
        `reload to pick up the current worker`,
    );
    this.name = "ProtocolMismatchError";
  }
}

/** Default instructions retired per run slice.
 *
 *  Sized so a slice is short enough that `pause` is honoured promptly,
 *  and long enough that the per-slice overhead does not dominate. The
 *  run loop yields between slices regardless, so this trades latency
 *  against throughput rather than correctness. */
export const DEFAULT_SLICE_BUDGET = 200_000;
