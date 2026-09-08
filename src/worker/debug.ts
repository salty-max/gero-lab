/**
 * The two debug tables (gero-lab.md §6).
 *
 * **Symbols** drive the disassembly's label column and the memory
 * pane's annotations. **Lines** drive source-level stepping, the
 * current-line highlight, and setting a breakpoint by clicking a line
 * rather than typing an address.
 *
 * An image may carry neither. That is not an error: the lab still
 * disassembles, still shows memory and registers, and the source-level
 * features degrade to address-level ones. The degradation is reported
 * so the UI can say so rather than presenting dead controls.
 */

/** A name bound to an address. */
export interface Symbol_ {
  name: string;
  addr: number;
  kind: "label" | "data" | "unknown";
}

/** An address range attributed to one source position. Ranges nest —
 *  a statement's contains its sub-expressions' — so a lookup wants the
 *  narrowest one covering an address. */
export interface LineRow {
  start: number;
  end: number;
  file: string;
  line: number;
  column: number;
}

export interface DebugInfo {
  symbols: Symbol_[];
  lines: LineRow[];
  /** False when the image carried no debug section — the UI shows
   *  address-level features only, and says why. */
  present: boolean;
}

export const NO_DEBUG_INFO: DebugInfo = { symbols: [], lines: [], present: false };

/** The module's JSON, before the file indices are resolved to names. */
interface RawDebug {
  symbols?: { address: number; kind: string; name: string }[];
  files?: string[];
  lines?: { start: number; end: number; file: number; line: number; column: number }[];
}

/** Parse the module's debug JSON. A shape the module does not produce
 *  degrades to "absent" rather than throwing: a lab that will not open
 *  because a table is unfamiliar is worse than one without the table. */
export function parseDebugInfo(json: string | null): DebugInfo {
  if (!json) return NO_DEBUG_INFO;
  let raw: RawDebug;
  try {
    raw = JSON.parse(json) as RawDebug;
  } catch {
    return NO_DEBUG_INFO;
  }
  if (typeof raw !== "object" || raw === null) return NO_DEBUG_INFO;

  const files = raw.files ?? [];
  const symbols: Symbol_[] = (raw.symbols ?? []).map((s) => ({
    name: s.name,
    addr: s.address,
    kind: s.kind === "label" || s.kind === "data" ? s.kind : "unknown",
  }));
  // A row names its file by index into the manifest's own list, so it
  // is resolved once here rather than at every lookup.
  const lines: LineRow[] = (raw.lines ?? []).map((r) => ({
    start: r.start,
    end: r.end,
    file: files[r.file] ?? "",
    line: r.line,
    column: r.column,
  }));

  return { symbols, lines, present: symbols.length > 0 || lines.length > 0 };
}

/** The symbol at or below `addr`, or null. Used for the label column,
 *  where a row is labelled by the last name that started before it. */
export function symbolAt(info: DebugInfo, addr: number): Symbol_ | null {
  let best: Symbol_ | null = null;
  for (const s of info.symbols) {
    if (s.addr <= addr && (best === null || s.addr > best.addr)) best = s;
  }
  return best;
}

/** The source position an address belongs to.
 *
 *  Ranges nest, so the narrowest one covering `addr` is what a reader
 *  means by "the current line" — the widest would highlight the whole
 *  enclosing function on every step. */
export function lineAt(info: DebugInfo, addr: number): LineRow | null {
  let best: LineRow | null = null;
  for (const row of info.lines) {
    if (addr < row.start || addr >= row.end) continue;
    if (best === null || row.end - row.start < best.end - best.start) best = row;
  }
  return best;
}

/** The lowest address attributed to a source line, for setting a
 *  breakpoint by clicking it. Null when the line produced no code —
 *  a comment, a blank line, a declaration. */
export function addrOfLine(info: DebugInfo, file: string, line: number): number | null {
  let best: number | null = null;
  for (const row of info.lines) {
    if (row.file === file && row.line === line && (best === null || row.start < best)) {
      best = row.start;
    }
  }
  return best;
}
