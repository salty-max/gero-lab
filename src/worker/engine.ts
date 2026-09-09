/**
 * The engine (gero-lab.md §3.3).
 *
 * Owns the VM instance and every allocation inside the module, and runs
 * the program in slices so `pause` is honoured promptly and a tight
 * loop cannot starve the message queue.
 *
 * Kept free of `self.postMessage` so it can be driven directly by a
 * test: the worker entry point is a thin adapter over this class.
 */

import {
  DEFAULT_SLICE_BUDGET,
  PROTOCOL_VERSION,
  type Command,
  type Diagnostic,
  type Event,
  REGISTER_NAMES,
  type PauseReason,
  type Registers,
} from "./protocol.js";
import { GeroModule, ModuleError, StepReason, Status } from "./module.js";

/** Where an event goes. The worker passes `postMessage`; a test passes
 *  an array's `push`. */
export type Emit = (event: Event) => void;

/** Yields to the event loop between slices, waiting `ms` when the run
 *  is paced. Overridden in tests so a run completes without real
 *  timers. */
export type Yield = (ms: number) => Promise<void>;

function toRegisters(values: readonly number[]): Registers {
  const out = {} as Registers;
  REGISTER_NAMES.forEach((name, i) => {
    out[name] = values[i] ?? 0;
  });
  return out;
}

function parseDiagnostics(json: string | null): Diagnostic[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as Diagnostic[]) : [];
  } catch {
    // A module that emitted unparseable JSON is a module bug, but it
    // must not take the session down — the build still reported a
    // status the UI can act on.
    return [];
  }
}

/** `StepReason` → the reason a `paused` event carries. `budget` never
 *  reaches here: it means the slice ended with the program still
 *  running, which the loop handles rather than reporting. */
function pauseReasonOf(reason: number): PauseReason | null {
  switch (reason) {
    case StepReason.halted: return "halt";
    case StepReason.breakpoint: return "breakpoint";
    case StepReason.faulted: return "fault";
    default: return null;
  }
}

export class Engine {
  private module: GeroModule | null = null;
  private handle = 0;
  private running = false;
  /** Set by `pause` and read at the top of the next slice — the loop
   *  never checks it mid-slice, so a slice is atomic. */
  private pauseRequested = false;
  /** Serializes everything but `pause`; see `handle_`. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly emit: Emit,
    private readonly loadModule: () => Promise<GeroModule>,
    private readonly nextTick: Yield = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Commands the engine runs at once, ahead of anything queued.
   *
   *  `pause` only sets a flag the run loop reads at its next slice
   *  boundary, so running it immediately cannot land mid-slice — and
   *  queueing it behind `run`, which does not resolve until the program
   *  stops, is the one way to make it unreachable. */
  private static readonly immediate: ReadonlySet<Command["type"]> = new Set(["pause"]);

  /**
   * Take one command from the host.
   *
   * Commands are serialized: `run` is long-lived and yields between
   * slices, so an unserialized `step` arriving mid-run would drive the
   * VM from two places at once. `pause` is the exception, and the
   * reason the queue has one.
   */
  receive(command: Command): Promise<void> {
    const run = () => this.guarded(command);
    if (Engine.immediate.has(command.type)) return run();
    this.queue = this.queue.then(run);
    return this.queue;
  }

  private async guarded(command: Command): Promise<void> {
    try {
      await this.dispatch(command);
    } catch (err) {
      const message = err instanceof ModuleError || err instanceof Error
        ? err.message
        : String(err);
      this.emit({ type: "error", message, command: command.type });
    }
  }

  private async dispatch(command: Command): Promise<void> {
    switch (command.type) {
      case "init": return this.init();
      case "build": return this.build(command);
      case "check": return this.check(command);
      case "load": return this.load(command.image);
      case "reset": return this.reset();
      case "run": return this.run(command.sliceBudget ?? DEFAULT_SLICE_BUDGET, command.stepDelayMs ?? 0);
      case "pause": return this.pause();
      case "step": return this.step(command.count ?? 1);
      case "breakpoints": return this.breakpoints(command.addrs);
      case "peek": return this.peek(command.addr, command.len);
      case "poke": return this.poke(command.addr, command.bytes);
      case "setReg": return this.setReg(command.index, command.value);
      case "irq": return this.irq(command.vector);
      case "sram": return this.readSram();
      case "loadSram": return this.writeSram(command.bytes);
    }
  }

  private need(): { mod: GeroModule; handle: number } {
    if (!this.module) throw new Error("the engine is not initialized — send `init` first");
    return { mod: this.module, handle: this.handle };
  }

  private async init(): Promise<void> {
    this.module = await this.loadModule();
    this.handle = this.module.vmCreate();
    this.emit({ type: "ready", protocol: PROTOCOL_VERSION, version: this.module.version() });
  }

  private build(command: Extract<Command, { type: "build" }>): void {
    const { mod } = this.need();
    mod.putFiles(command.files);
    const r = mod.build(command.entry, command.lang);
    const diagnostics = parseDiagnostics(r.diagnosticsJson);
    const ok = r.status === Status.ok && r.payload !== null;
    this.emit({
      type: "built",
      ok,
      ...(r.payload ? { image: r.payload } : {}),
      diagnostics,
    });
    if (!ok || !r.payload) return;

    // The panes want the disassembly and the debug tables for the image
    // that was just built; producing them here saves the UI a round
    // trip and keeps them in step with what is loaded.
    this.emit({
      type: "program",
      disassembly: mod.disasm(r.payload),
      debugJson: mod.debugInfo(r.payload),
    });

    // A successful build loads straight away: the UI's next act is
    // always to run or step, and a build that left the VM holding the
    // previous image would run the wrong program.
    this.load(r.payload);
  }

  /** Diagnostics only. Deliberately touches neither the loaded image
   *  nor the VM: the editor runs this on every edit, and a keystroke
   *  must not disturb a paused program. */
  private check(command: Extract<Command, { type: "check" }>): void {
    const { mod } = this.need();
    mod.putFiles(command.files);
    const r = mod.check(command.entry, command.lang);
    this.emit({ type: "checked", diagnostics: parseDiagnostics(r.diagnosticsJson) });
  }

  private load(image: Uint8Array): void {
    const { mod, handle } = this.need();
    const r = mod.vmLoad(handle, image);
    if (r.status !== Status.ok) throw new ModuleError(r.status, "load");
    this.emitSnapshot();
  }

  private reset(): void {
    const { mod, handle } = this.need();
    // Only a run in flight has a pause to request; setting the flag
    // with nothing running would leave it to stop the next one.
    if (this.running) this.pauseRequested = true;
    mod.vmReset(handle);
    this.emitSnapshot();
  }

  private pause(): void {
    // Honoured at the next slice boundary rather than immediately: a
    // slice is atomic, so state the UI reads is never mid-instruction.
    this.pauseRequested = true;
  }

  /**
   * Run in slices, yielding between them.
   *
   * Events coalesce per slice — at most one `output` and one `trace`,
   * whatever the program did inside it. A program printing in a tight
   * loop therefore produces a bounded event rate no matter how fast it
   * runs, which is the difference between a responsive UI and a page
   * that dies under its own message queue.
   */
  private async run(sliceBudget: number, stepDelayMs: number): Promise<void> {
    const { mod, handle } = this.need();
    if (this.running) return;
    this.running = true;

    try {
      for (;;) {
        if (this.pauseRequested) {
          this.emitPaused("manual", mod.vmRegs(handle)[0] ?? 0, undefined, 0);
          return;
        }

        const outcome = mod.vmStep(handle, sliceBudget);
        this.drainOutput(mod, handle);

        const reason = pauseReasonOf(outcome.reason);
        if (reason) {
          this.emitPaused(reason, outcome.ip, outcome.fault, outcome.steps);
          return;
        }
        if (outcome.reason === StepReason.notLoaded) {
          throw new Error("no image is loaded — send `build` or `load` first");
        }

        // Still running: one trace per slice, not one per instruction.
        this.emit({ type: "trace", ip: outcome.ip, steps: outcome.steps });
        // The delay rides the yield the loop already takes, so a paced
        // run is still a `pause` away from stopping.
        await this.nextTick(stepDelayMs);
      }
    } finally {
      this.running = false;
      // Cleared when the run ends rather than when one begins: a pause
      // that arrives while `run` is still queued belongs to that run,
      // and clearing on entry would drop it.
      this.pauseRequested = false;
    }
  }

  private step(count: number): void {
    const { mod, handle } = this.need();
    const outcome = mod.vmStep(handle, Math.max(1, count));
    this.drainOutput(mod, handle);
    this.emitPaused(
      pauseReasonOf(outcome.reason) ?? "manual",
      outcome.ip,
      outcome.fault,
      outcome.steps,
    );
  }

  private breakpoints(addrs: number[]): void {
    const { mod, handle } = this.need();
    mod.vmSetBreakpoints(handle, addrs);
    this.emit({ type: "bp", addrs: [...addrs] });
  }

  private peek(addr: number, len: number): void {
    const { mod, handle } = this.need();
    this.emit({ type: "mem", addr, bytes: mod.vmPeek(handle, addr, len) });
  }

  private poke(addr: number, bytes: Uint8Array): void {
    const { mod, handle } = this.need();
    mod.vmPoke(handle, addr, bytes);
    this.emit({ type: "mem", addr, bytes });
  }

  private setReg(index: number, value: number): void {
    const { mod, handle } = this.need();
    mod.vmSetReg(handle, index, value);
    this.emitSnapshot();
  }

  private irq(vector: number): void {
    const { mod, handle } = this.need();
    mod.vmRaiseIrq(handle, vector);
    this.emit({ type: "irq", vector });
  }

  private readSram(): void {
    const { mod, handle } = this.need();
    this.emit({ type: "sram", bytes: mod.vmSram(handle) });
  }

  private writeSram(bytes: Uint8Array): void {
    const { mod, handle } = this.need();
    mod.vmLoadSram(handle, bytes);
  }

  private drainOutput(mod: GeroModule, handle: number): void {
    const text = mod.vmTakeOutput(handle);
    if (text.length > 0) this.emit({ type: "output", text });
  }

  private emitSnapshot(): void {
    const { mod, handle } = this.need();
    this.emit({ type: "snapshot", regs: toRegisters(mod.vmRegs(handle)) });
  }

  private emitPaused(reason: PauseReason, ip: number, fault: number | undefined, steps: number): void {
    this.emit({
      type: "paused",
      reason,
      ip,
      ...(fault ? { fault } : {}),
      steps,
    });
    this.emitSnapshot();
  }
}
