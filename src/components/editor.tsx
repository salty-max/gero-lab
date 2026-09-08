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

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Sample } from "@/samples";
import { addrOfLine, type DebugInfo } from "@/worker/debug";
import type { Diagnostic, SourceFile } from "@/worker/protocol";

/** A diagnostic's columns on one line, half-open and 0-based. A
 *  diagnostic that reports a point rather than a span — every asm one —
 *  marks to the end of its line. */
interface Mark {
  from: number;
  to: number;
  severity: Diagnostic["severity"];
}

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

const decoration = {
  error: "underline decoration-destructive decoration-wavy",
  warning: "underline decoration-warning decoration-wavy",
  note: "underline decoration-ip decoration-dotted",
} as const;

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
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <header className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
        <Select
          value={buffer.sample.name}
          onValueChange={(name) => {
            const next = samples.find((s) => s.name === name);
            if (next) onChooseSample(next);
          }}
        >
          <SelectTrigger size="sm" className="w-40" aria-label="sample">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {samples.map((s) => (
              <SelectItem key={s.name} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Badge variant="outline" className="font-mono text-[10px] uppercase">
          {buffer.sample.lang}
        </Badge>

        {/* One tab per file. A single-file sample still gets its tab, so
            the entry point is named rather than implied. */}
        <Tabs value={open.name} onValueChange={(name) => onOpenFile(String(name))}>
          <TabsList className="h-7">
            {buffer.files.map((f) => (
              <TabsTrigger key={f.name} value={f.name} className="gap-1.5 font-mono text-[11px]">
                {f.name}
                {f.name === buffer.sample.entry && (
                  <span className="text-[9px] text-symbol">entry</span>
                )}
                {diagnostics.some((d) => d.file === f.name && d.severity === "error") && (
                  <span className="text-destructive">•</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </header>

      <div className="flex min-h-0 flex-1 overflow-auto">
        <div className="shrink-0 border-r py-2 font-mono text-xs select-none">
          {lines.map((_, i) => {
            const line = i + 1;
            const addr = addrOfLine(debug, open.name, line);
            const isCurrent = currentLine?.file === open.name && currentLine.line === line;
            const hasBp = addr !== null && breakpoints.includes(addr);
            const severity = worstByLine.get(line);
            const gutter = (
              <button
                type="button"
                disabled={addr === null}
                onClick={() => onToggleBreakpoint(open.name, line)}
                className={cn(
                  "flex w-16 items-center gap-1.5 px-2 leading-5",
                  addr !== null && "hover:bg-muted",
                  isCurrent && "bg-ip/15",
                )}
              >
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    hasBp ? "bg-breakpoint" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "w-2 text-center",
                    severity === "error" && "text-destructive",
                    severity && severity !== "error" && "text-warning",
                  )}
                  aria-hidden
                >
                  {severity === "error" ? "✕" : severity ? "!" : ""}
                </span>
                <span
                  className={cn(
                    "ml-auto tabular-nums",
                    isCurrent ? "text-ip" : "text-muted-foreground",
                  )}
                >
                  {line}
                </span>
              </button>
            );
            // A line the tables do not map cannot take a breakpoint, so
            // it says why rather than looking like a dead control.
            return addr === null ? (
              <Tooltip key={line}>
                <TooltipTrigger render={gutter} />
                <TooltipContent>This line produced no code</TooltipContent>
              </Tooltip>
            ) : (
              <div key={line}>{gutter}</div>
            );
          })}
        </div>

        {/* The mirror and the textarea share one metric and one box, so
            a squiggle stays under its token. */}
        <div className="relative min-h-0 flex-1">
          <pre
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2 font-mono text-xs leading-5 whitespace-pre text-transparent"
          >
            {lines.map((text, i) => {
              const line = i + 1;
              const isCurrent = currentLine?.file === open.name && currentLine.line === line;
              return (
                <div key={line} className={cn("h-5", isCurrent && "bg-ip/15")}>
                  <MarkedLine
                    text={text}
                    marks={marksOn(diagnostics, open.name, line, text.length)}
                  />
                </div>
              );
            })}
          </pre>
          <textarea
            className="absolute inset-0 size-full resize-none overflow-hidden bg-transparent px-3 py-2 font-mono text-xs leading-5 whitespace-pre outline-none"
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
          <span key={from} className={severity && decoration[severity]}>
            {text.slice(from, to)}
          </span>
        );
      })}
      {/* A span reaching past the last character still has to show, so
          the trailing cell stands in for it. */}
      {marks.some((m) => m.to > text.length) && (
        <span className={decoration.error}> </span>
      )}
    </>
  );
}
