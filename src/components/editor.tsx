/**
 * The source editor: a sample picker, one tab per file, and a gutter
 * that turns a line into a breakpoint.
 *
 * A textarea rather than a code editor component. Highlighting comes
 * from the tree-sitter grammar in a later pass; putting a full editor
 * in first would mean porting it twice.
 */

import { useMemo } from "react";

import type { Sample } from "../samples.js";
import { cn } from "../ui/primitives.js";
import { addrOfLine, type DebugInfo } from "../worker/debug.js";
import type { SourceFile } from "../worker/protocol.js";

export function Editor({
  samples,
  buffer,
  open,
  currentLine,
  breakpoints,
  debug,
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
  onChooseSample: (sample: Sample) => void;
  onOpenFile: (name: string) => void;
  onEdit: (text: string) => void;
  onToggleBreakpoint: (file: string, line: number) => void;
}) {
  const lineCount = useMemo(() => open.text.split("\n").length, [open.text]);

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
          {buffer.files.map((f) => (
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
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="shrink-0 select-none border-r border-slate-800 py-2 font-mono text-xs">
          {Array.from({ length: lineCount }, (_, i) => {
            const line = i + 1;
            const addr = addrOfLine(debug, open.name, line);
            const isCurrent = currentLine?.file === open.name && currentLine.line === line;
            const hasBp = addr !== null && breakpoints.includes(addr);
            return (
              <button
                key={line}
                type="button"
                disabled={addr === null}
                onClick={() => onToggleBreakpoint(open.name, line)}
                title={addr === null ? "this line produced no code" : undefined}
                className={cn(
                  "flex w-14 items-center gap-1.5 px-2 leading-5",
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
                  className={cn("tabular-nums", isCurrent ? "text-sky-300" : "text-slate-600")}
                >
                  {line}
                </span>
              </button>
            );
          })}
        </div>
        <textarea
          className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-xs leading-5 text-slate-200 outline-none"
          value={open.text}
          spellCheck={false}
          onChange={(e) => onEdit(e.target.value)}
          aria-label={open.name}
        />
      </div>
    </section>
  );
}
