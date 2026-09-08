/**
 * The source editor: a sample picker, one tab per file, a gutter that
 * turns a line into a breakpoint, and the diagnostics drawn where they
 * happened (§5).
 *
 * A textarea over a mirrored layer, rather than a code editor
 * component: the layer draws the squiggles and the current-line band,
 * the textarea sits transparent on top and keeps native editing and
 * selection. Highlighting comes from the tree-sitter grammar in a later
 * pass, and it draws into the same layer.
 */

import { useMemo, useRef } from "react";

import type { Sample } from "../samples.js";
import { cn } from "../ui/primitives.js";
import { addrOfLine, type DebugInfo } from "../worker/debug.js";
import type { Diagnostic, SourceFile } from "../worker/protocol.js";

/** A diagnostic's columns on one line, half-open and 0-based. A
 *  diagnostic that reports a point rather than a span — every asm one —
 *  marks to the end of its line. */
interface Mark {
  from: number;
  to: number;
  severity: Diagnostic["severity"];
}

const isError = (d: Diagnostic) => d.severity === "error";

/** Which columns of `line` each diagnostic covers.
 *
 *  Spans are 1-based and inclusive of the start column; a span crossing
 *  several lines marks each of them from its own edges inward. */
function marksOn(diagnostics: Diagnostic[], file: string, line: number, length: number): Mark[] {
  const marks: Mark[] = [];
  for (const d of diagnostics) {
    if (d.file !== file) continue;
    const endLine = d.end_line ?? d.line;
    if (line < d.line || line > endLine) continue;
    const from = line === d.line ? d.column - 1 : 0;
    const to = line === endLine && d.end_col !== undefined ? d.end_col - 1 : length;
    // A zero-width span still has to be visible, so it claims one cell.
    marks.push({ from, to: Math.max(to, from + 1), severity: d.severity });
  }
  return marks;
}

export function Editor({
  samples,
  buffer,
  open,
  currentLine,
  breakpoints,
  debug,
  diagnostics,
  onChooseSample,
  onOpenFile,
  onEdit,
  onToggleBreakpoint,
}: {
  samples: Sample[];
  buffer: { sample: Sample; files: SourceFile[]; open: string };
  open: SourceFile;
  currentLine: { file: string; line: number } | null;
  breakpoints: number[];
  debug: DebugInfo;
  diagnostics: Diagnostic[];
  onChooseSample: (sample: Sample) => void;
  onOpenFile: (name: string) => void;
  onEdit: (text: string) => void;
  onToggleBreakpoint: (file: string, line: number) => void;
}) {
  const lines = useMemo(() => open.text.split("\n"), [open.text]);
  const scroller = useRef<HTMLDivElement>(null);

  /** The worst diagnostic on each line, for the gutter marker. */
  const worstByLine = useMemo(() => {
    const worst = new Map<number, Diagnostic["severity"]>();
    for (const d of diagnostics) {
      if (d.file !== open.name) continue;
      for (let line = d.line; line <= (d.end_line ?? d.line); line++) {
        if (worst.get(line) !== "error") worst.set(line, d.severity);
      }
    }
    return worst;
  }, [diagnostics, open.name]);

  return (
    <section className="flex min-h-0 flex-col rounded border border-slate-800 bg-slate-900/60">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-1.5">
        <select
          className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] outline-none"
          value={buffer.sample.name}
          onChange={(e) => {
            const next = samples.find((s) => s.name === e.target.value);
            if (next) onChooseSample(next);
          }}
          aria-label="sample"
        >
          {samples.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] uppercase tracking-widest text-slate-600">
          {buffer.sample.lang}
        </span>

        {/* One tab per file. A single-file sample still gets its tab, so
            the entry point is named rather than implied. */}
        <div className="ml-2 flex items-center gap-1 overflow-x-auto">
          {buffer.files.map((f) => {
            const errors = diagnostics.some((d) => d.file === f.name && isError(d));
            return (
              <button
                key={f.name}
                type="button"
                onClick={() => onOpenFile(f.name)}
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[11px] whitespace-nowrap",
                  f.name === open.name
                    ? "bg-slate-700 text-slate-100"
                    : "text-slate-500 hover:bg-slate-800",
                )}
              >
                {f.name}
                {f.name === buffer.sample.entry && (
                  <span className="ml-1.5 text-[9px] text-emerald-500/80">entry</span>
                )}
                {errors && <span className="ml-1.5 text-rose-400">•</span>}
              </button>
            );
          })}
        </div>
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 overflow-auto">
        <div className="shrink-0 select-none border-r border-slate-800 py-2 font-mono text-xs">
          {lines.map((_, i) => {
            const line = i + 1;
            const addr = addrOfLine(debug, open.name, line);
            const isCurrent = currentLine?.file === open.name && currentLine.line === line;
            const hasBp = addr !== null && breakpoints.includes(addr);
            const severity = worstByLine.get(line);
            return (
              <button
                key={line}
                type="button"
                disabled={addr === null}
                onClick={() => onToggleBreakpoint(open.name, line)}
                title={addr === null ? "this line produced no code" : undefined}
                className={cn(
                  "flex w-16 items-center gap-1.5 px-2 leading-5",
                  addr !== null && "hover:bg-slate-800/60",
                  isCurrent && "bg-sky-950/70",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    hasBp ? "bg-rose-500" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "w-2 text-center",
                    severity === "error" && "text-rose-400",
                    severity === "warning" && "text-amber-400",
                  )}
                  aria-hidden
                >
                  {severity === "error" ? "✕" : severity ? "!" : ""}
                </span>
                <span
                  className={cn(
                    "ml-auto tabular-nums",
                    isCurrent ? "text-sky-300" : "text-slate-600",
                  )}
                >
                  {line}
                </span>
              </button>
            );
          })}
        </div>

        {/* The mirror and the textarea share one grid cell, one metric,
            and one scroll box, so a squiggle stays under its token. */}
        <div className="relative min-h-0 flex-1">
          <pre
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 font-mono text-xs leading-5 whitespace-pre text-transparent"
          >
            {lines.map((text, i) => {
              const line = i + 1;
              const isCurrent = currentLine?.file === open.name && currentLine.line === line;
              return (
                <div key={line} className={cn("h-5", isCurrent && "bg-sky-950/70")}>
                  <MarkedLine text={text} marks={marksOn(diagnostics, open.name, line, text.length)} />
                </div>
              );
            })}
          </pre>
          <textarea
            className="absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre text-slate-200 outline-none"
            value={open.text}
            spellCheck={false}
            wrap="off"
            onChange={(e) => onEdit(e.target.value)}
            aria-label={open.name}
          />
        </div>
      </div>
    </section>
  );
}

/** One mirrored line: the text, invisible, with the marked runs
 *  underlined. The text is kept rather than dropped so each run lands
 *  at the column its diagnostic named. */
function MarkedLine({ text, marks }: { text: string; marks: Mark[] }) {
  if (marks.length === 0) return <>{text || " "}</>;

  const edges = new Set<number>([0, text.length]);
  for (const m of marks) {
    edges.add(Math.min(m.from, text.length));
    edges.add(Math.min(m.to, text.length));
  }
  const cuts = [...edges].sort((a, b) => a - b);

  return (
    <>
      {cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1]!;
        const covering = marks.filter((m) => m.from <= from && m.to >= to);
        const severity = covering.some((m) => m.severity === "error")
          ? "error"
          : covering[0]?.severity;
        return (
          <span
            key={from}
            className={cn(
              severity === "error" && "underline decoration-rose-500 decoration-wavy",
              severity === "warning" && "underline decoration-amber-500 decoration-wavy",
              severity === "note" && "underline decoration-sky-500 decoration-dotted",
            )}
          >
            {text.slice(from, to)}
          </span>
        );
      })}
      {/* A span reaching past the last character still has to show, so
          the trailing cell stands in for it. */}
      {marks.some((m) => m.to > text.length) && (
        <span className="underline decoration-rose-500 decoration-wavy"> </span>
      )}
    </>
  );
}
