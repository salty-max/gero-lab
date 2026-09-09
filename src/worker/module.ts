/**
 * The wasm boundary (gero-lab.md §2).
 *
 * A thin, typed binding over `gero.wasm`. It owns the arena discipline
 * so nothing above it has to: pointers are arena-relative offsets, a
 * `Result` is five little-endian `u32`s, and the module holds no state
 * the worker does not put there.
 *
 * This file contains no toolchain or VM logic — §11's rule. Every
 * operation is a call into the module.
 */

/** `Result`'s five `u32`s. Part of the boundary (§2.2). */
const RESULT_SIZE = 20;

/** `StepOutcome`'s four `u32`s: reason, ip, fault, steps. */
const STEP_OUTCOME_SIZE = 16;

/** `abi.Status`. A host branches on these, so the values are fixed. */
export const Status = {
  ok: 0,
  diagnostics: 1,
  notInitialized: 2,
  outOfMemory: 3,
  badLang: 4,
  badPointer: 5,
} as const;

/** `vm.StepReason`. Why a slice stopped. */
export const StepReason = {
  budget: 0,
  halted: 1,
  breakpoint: 2,
  faulted: 3,
  notLoaded: 4,
} as const;

/** `bank` value selecting the base image rather than a bank window.
 *  Bank 0 is a real window, so it cannot double as "no bank". */
export const NO_BANK = 0xffff_ffff;

/** The `lang` discriminant the module takes. */
export const LangCode = { gas: 0, gr: 1 } as const;

export interface StepOutcome {
  reason: number;
  ip: number;
  fault: number;
  steps: number;
}

export interface ModuleResult {
  status: number;
  payload: Uint8Array | null;
  diagnosticsJson: string | null;
}

interface Exports {
  memory: WebAssembly.Memory;
  gero_init(arenaBytes: number): number;
  gero_reset(): void;
  gero_alloc(len: number): number;
  gero_arena_base(): number;
  gero_version(): number;
  gero_file_put(namePtr: number, nameLen: number, srcPtr: number, srcLen: number): number;
  gero_files_clear(): void;
  gero_check(namePtr: number, nameLen: number, lang: number): number;
  gero_compile(namePtr: number, nameLen: number): number;
  gero_assemble(namePtr: number, nameLen: number): number;
  gero_disasm(gxPtr: number, gxLen: number, bank: number, showBytes: number): number;
  gero_debug_info(gxPtr: number, gxLen: number): number;
  gero_vm_create(): number;
  gero_vm_destroy(handle: number): number;
  gero_vm_load(handle: number, ptr: number, len: number): number;
  gero_vm_reset(handle: number): number;
  gero_vm_step(handle: number, budget: number): number;
  gero_vm_regs(handle: number): number;
  gero_vm_peek(handle: number, addr: number, len: number): number;
  gero_vm_poke(handle: number, addr: number, ptr: number, len: number): number;
  gero_vm_set_reg(handle: number, index: number, value: number): number;
  gero_vm_raise_irq(handle: number, vector: number): number;
  gero_vm_take_output(handle: number): number;
  gero_vm_sram(handle: number): number;
  gero_vm_load_sram(handle: number, ptr: number, len: number): number;
  gero_vm_breakpoint_add(handle: number, addr: number): number;
  gero_vm_breakpoint_clear(handle: number): number;
}

/** Thrown when the module reports a status the caller cannot proceed
 *  past. Carries the code so a host can tell "out of arena, raise the
 *  ceiling and retry" from "you passed a bad pointer". */
export class ModuleError extends Error {
  constructor(readonly status: number, what: string) {
    super(`${what}: module status ${status}`);
    this.name = "ModuleError";
  }
}

export class GeroModule {
  private constructor(
    private readonly ex: Exports,
    private readonly decoder = new TextDecoder(),
    private readonly encoder = new TextEncoder(),
  ) {}

  /** Instantiate and bring up the arena. */
  static async instantiate(source: BufferSource, arenaBytes = 32 << 20): Promise<GeroModule> {
    const { instance } = await WebAssembly.instantiate(source, {});
    const ex = instance.exports as unknown as Exports;
    const status = ex.gero_init(arenaBytes);
    if (status !== Status.ok) throw new ModuleError(status, "gero_init");
    return new GeroModule(ex);
  }

  /** A fresh view each time: the memory buffer detaches whenever the
   *  module grows, so a cached view silently reads the wrong bytes. */
  private get view(): DataView {
    return new DataView(this.ex.memory.buffer);
  }

  /** Arena offsets are not linear-memory addresses (§2.1): a pointer
   *  means `memory.buffer + gero_arena_base() + ptr`. Resolving it here
   *  is the one place that indirection lives. */
  private absolute(ptr: number): number {
    return this.ex.gero_arena_base() + ptr;
  }

  private bytesAt(ptr: number, len: number): Uint8Array {
    // An empty payload is normal — a step that printed nothing, a peek
    // of zero bytes — and its pointer may sit at the arena's high-water
    // mark, which is a valid offset but not a valid view origin.
    if (len === 0) return new Uint8Array(0);
    // Copied, not a subarray: the caller may hold it across a call that
    // grows memory, which would detach the backing buffer.
    return new Uint8Array(this.ex.memory.buffer, this.absolute(ptr), len).slice();
  }

  /** Decode the `Result` a `*const Result` export returned. */
  private result(ptr: number): ModuleResult {
    const v = this.view;
    // The `*const Result` an export returns is a real linear-memory
    // address; the pointers *inside* it are arena offsets.
    const status = v.getUint32(ptr, true);
    const payloadPtr = v.getUint32(ptr + 4, true);
    const payloadLen = v.getUint32(ptr + 8, true);
    const diagPtr = v.getUint32(ptr + 12, true);
    const diagLen = v.getUint32(ptr + 16, true);
    return {
      status,
      payload: payloadPtr === 0 ? null : this.bytesAt(payloadPtr, payloadLen),
      diagnosticsJson: diagPtr === 0 ? null : this.decoder.decode(this.bytesAt(diagPtr, diagLen)),
    };
  }

  /** Copy bytes into the arena and return the offset. */
  private put(bytes: Uint8Array): number {
    const ptr = this.ex.gero_alloc(bytes.length);
    if (ptr === 0 && bytes.length > 0) throw new ModuleError(Status.outOfMemory, "gero_alloc");
    new Uint8Array(this.ex.memory.buffer).set(bytes, this.absolute(ptr));
    return ptr;
  }

  private putText(text: string): { ptr: number; len: number } {
    const bytes = this.encoder.encode(text);
    return { ptr: this.put(bytes), len: bytes.length };
  }

  /** Drop everything the arena holds. The module keeps no state across
   *  this, so every session begins from a known floor. */
  reset(): void {
    this.ex.gero_reset();
  }

  version(): string {
    const r = this.result(this.ex.gero_version());
    return r.payload ? this.decoder.decode(r.payload) : "unknown";
  }

  /** Replace the virtual file set (§4.2). */
  putFiles(files: readonly { name: string; text: string }[]): void {
    this.ex.gero_files_clear();
    for (const f of files) {
      const n = this.putText(f.name);
      const s = this.putText(f.text);
      const status = this.ex.gero_file_put(n.ptr, n.len, s.ptr, s.len);
      if (status !== Status.ok) throw new ModuleError(status, `gero_file_put(${f.name})`);
    }
  }

  build(entry: string, lang: keyof typeof LangCode): ModuleResult {
    const n = this.putText(entry);
    const ptr = lang === "gr"
      ? this.ex.gero_compile(n.ptr, n.len)
      : this.ex.gero_assemble(n.ptr, n.len);
    return this.result(ptr);
  }

  /** Diagnostics for the entry, without lowering it to an image. */
  check(entry: string, lang: keyof typeof LangCode): ModuleResult {
    const n = this.putText(entry);
    return this.result(this.ex.gero_check(n.ptr, n.len, LangCode[lang]));
  }

  /** Disassemble an image. Text, one instruction per line.
   *
   *  `showBytes` adds the hex column beside each instruction. It has to
   *  come from the module: the gutter carries CPU addresses, not
   *  offsets into the `.gx`, so slicing the bytes here would read the
   *  file's header. */
  disasm(image: Uint8Array, bank: number = NO_BANK, showBytes = false): string {
    const ptr = this.put(image);
    const r = this.result(this.ex.gero_disasm(ptr, image.length, bank, showBytes ? 1 : 0));
    if (r.status !== Status.ok) throw new ModuleError(r.status, "gero_disasm");
    return r.payload ? this.decoder.decode(r.payload) : "";
  }

  /** The `.gx` debug section as JSON: the symbol and line tables (§6).
   *  Absent when the image carries none, which is not an error — the
   *  panes degrade to address-level rather than failing. */
  debugInfo(image: Uint8Array): string | null {
    const ptr = this.put(image);
    const r = this.result(this.ex.gero_debug_info(ptr, image.length));
    if (r.status !== Status.ok) throw new ModuleError(r.status, "gero_debug_info");
    return r.payload && r.payload.length > 0 ? this.decoder.decode(r.payload) : null;
  }

  vmCreate(): number {
    return this.ex.gero_vm_create();
  }

  vmDestroy(handle: number): void {
    this.ex.gero_vm_destroy(handle);
  }

  vmLoad(handle: number, image: Uint8Array): ModuleResult {
    const ptr = this.put(image);
    return this.result(this.ex.gero_vm_load(handle, ptr, image.length));
  }

  vmReset(handle: number): void {
    this.ex.gero_vm_reset(handle);
  }

  /** Retire up to `budget` instructions. The outcome says why it
   *  stopped, which is what the run loop branches on. */
  vmStep(handle: number, budget: number): StepOutcome {
    const r = this.result(this.ex.gero_vm_step(handle, budget));
    if (!r.payload || r.payload.length < STEP_OUTCOME_SIZE) {
      throw new ModuleError(r.status, "gero_vm_step");
    }
    const v = new DataView(r.payload.buffer, r.payload.byteOffset);
    return {
      reason: v.getUint32(0, true),
      ip: v.getUint32(4, true),
      fault: v.getUint32(8, true),
      steps: v.getUint32(12, true),
    };
  }

  /** 15 little-endian `u16`s, in `Register` index order. */
  vmRegs(handle: number): number[] {
    const r = this.result(this.ex.gero_vm_regs(handle));
    if (!r.payload) throw new ModuleError(r.status, "gero_vm_regs");
    const v = new DataView(r.payload.buffer, r.payload.byteOffset);
    const out: number[] = [];
    for (let i = 0; i * 2 + 1 < r.payload.length; i++) out.push(v.getUint16(i * 2, true));
    return out;
  }

  vmPeek(handle: number, addr: number, len: number): Uint8Array {
    const r = this.result(this.ex.gero_vm_peek(handle, addr, len));
    if (!r.payload) throw new ModuleError(r.status, "gero_vm_peek");
    return r.payload;
  }

  vmPoke(handle: number, addr: number, bytes: Uint8Array): void {
    const ptr = this.put(bytes);
    const status = this.ex.gero_vm_poke(handle, addr, ptr, bytes.length);
    if (status !== Status.ok) throw new ModuleError(status, "gero_vm_poke");
  }

  vmSetReg(handle: number, index: number, value: number): void {
    const status = this.ex.gero_vm_set_reg(handle, index, value);
    if (status !== Status.ok) throw new ModuleError(status, "gero_vm_set_reg");
  }

  vmRaiseIrq(handle: number, vector: number): void {
    const status = this.ex.gero_vm_raise_irq(handle, vector);
    if (status !== Status.ok) throw new ModuleError(status, "gero_vm_raise_irq");
  }

  /** Drain the print buffer. Empty when the program printed nothing
   *  this slice, which is the common case. */
  vmTakeOutput(handle: number): string {
    const r = this.result(this.ex.gero_vm_take_output(handle));
    return r.payload ? this.decoder.decode(r.payload) : "";
  }

  /** The program's battery-backed banks. Empty when it declares none,
   *  which is most programs and not an error. */
  vmSram(handle: number): Uint8Array {
    const r = this.result(this.ex.gero_vm_sram(handle));
    if (r.status !== Status.ok) throw new ModuleError(r.status, "gero_vm_sram");
    return r.payload ?? new Uint8Array(0);
  }

  /** Restore banks saved by an earlier session.
   *
   *  The module refuses a save whose length does not match what this
   *  program declares, which is what keeps one program's save out of
   *  another's banks. */
  vmLoadSram(handle: number, bytes: Uint8Array): void {
    const ptr = this.put(bytes);
    const status = this.ex.gero_vm_load_sram(handle, ptr, bytes.length);
    if (status !== Status.ok) throw new ModuleError(status, "gero_vm_load_sram");
  }

  /** Replace the breakpoint set. Clearing first makes the command
   *  idempotent, so the UI need not track what the worker holds. */
  vmSetBreakpoints(handle: number, addrs: readonly number[]): void {
    this.ex.gero_vm_breakpoint_clear(handle);
    for (const a of addrs) this.ex.gero_vm_breakpoint_add(handle, a);
  }
}

export { RESULT_SIZE, STEP_OUTCOME_SIZE };
