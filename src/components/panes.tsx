/**
 * The cockpit's panes (gero-lab.md §6).
 *
 * Every value shown here came out of a worker event. Nothing decodes an
 * instruction, resolves a symbol from an image, or computes a flag —
 * the disassembly text, the debug tables and the register file all
 * arrive already formed.
 */

import { useState } from "react";

import { Hex, Pane, PaneEmpty } from "@/components/pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { lineAt, symbolAt, type DebugInfo } from "@/worker/debug";
import type { Diagnostic, Registers } from "@/worker/protocol";

const REGISTER_ORDER: (keyof Registers)[] = [
  "ip", "acu", "r1", "r2", "r3", "r4", "r5", "r6",
  "r7", "r8", "sp", "fp", "mb", "im", "flg",
];

/** `flg`'s bits, low to high. Bits 5–15 read as zero — the VM masks
 *  them on write — so showing them would be showing a constant. */
const FLAGS = ["Z", "C", "V", "N", "I"] as const;

/** How much one memory read fetches, and how it is laid out. Sixteen to
 *  a row is what makes the address column readable at a glance. */
const PEEK_BYTES = 128;
const BYTES_PER_ROW = 16;

export function RegisterPane({
  regs,
  onSetReg,
}: {
  regs: Registers | null;
  onSetReg: (index: number, value: number) => void;
}) {
  if (!regs) {
    return (
      <Pane title="Registers">
        <PaneEmpty>Build a program to see the register file.</PaneEmpty>
      </Pane>
    );
  }

  return (
    <Pane
      title="Registers"
      action={
        <div className="flex gap-1">
          {FLAGS.map((flag, bit) => (
            <Badge
              key={flag}
              variant={regs.flg & (1 << bit) ? "default" : "secondary"}
              className="px-1.5 py-0 font-mono text-[10px]"
            >
              {flag}
            </Badge>
          ))}
        </div>
      }
    >
      <Table className="text-xs">
        <TableBody>
          {REGISTER_ORDER.map((name, index) => (
            <TableRow key={name}>
              <TableCell className="w-14 py-1 font-mono text-muted-foreground">
                {name}
              </TableCell>
              <TableCell className="py-1">
                <Input
                  className="h-6 w-24 border-transparent bg-transparent px-1 font-mono tabular-nums shadow-none"
                  value={`$${regs[name].toString(16).toUpperCase().padStart(4, "0")}`}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value.replace(/^\$/, ""), 16);
                    if (Number.isFinite(parsed)) onSetReg(index, parsed & 0xffff);
                  }}
                  aria-label={`register ${name}`}
                />
              </TableCell>
              <TableCell className="py-1 text-right font-mono tabular-nums text-muted-foreground">
                {regs[name]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Pane>
  );
}

export function DisassemblyPane({
  text,
  debug,
  currentIp,
  breakpoints,
  onToggleBreakpoint,
}: {
  text: string;
  debug: DebugInfo;
  currentIp: number | null;
  breakpoints: number[];
  onToggleBreakpoint: (addr: number) => void;
}) {
  if (!text) {
    return (
      <Pane title="Disassembly">
        <PaneEmpty>Build a program to disassemble it.</PaneEmpty>
      </Pane>
    );
  }

  // Each line begins with its address, which is what lets a click set a
  // breakpoint without the UI decoding anything.
  const rows = text.split("\n").filter(Boolean).map((line) => {
    const match = /^([0-9A-Fa-f]{4}):/.exec(line);
    return { line, addr: match?.[1] ? Number.parseInt(match[1], 16) : null };
  });

  return (
    <Pane
      title="Disassembly"
      action={
        debug.present ? null : (
          <span className="text-[10px] text-warning">no debug info — addresses only</span>
        )
      }
    >
      <div className="font-mono text-xs">
        {rows.map((row, i) => {
          const isCurrent = row.addr !== null && row.addr === currentIp;
          const hasBp = row.addr !== null && breakpoints.includes(row.addr);
          const label = row.addr !== null ? symbolAt(debug, row.addr) : null;
          const showLabel = label && label.addr === row.addr;
          return (
            <div key={i}>
              {showLabel && (
                <div className="px-3 pt-2 text-[11px] text-symbol">{label.name}:</div>
              )}
              <button
                type="button"
                disabled={row.addr === null}
                onClick={() => row.addr !== null && onToggleBreakpoint(row.addr)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-0.5 text-left",
                  isCurrent ? "bg-ip/15 text-ip" : "hover:bg-muted",
                )}
              >
                <span
                  className={cn(
                    "inline-block size-2 shrink-0 rounded-full",
                    hasBp ? "bg-breakpoint" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <span className="whitespace-pre">{row.line}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Pane>
  );
}

export function MemoryPane({
  memory,
  debug,
  onPeek,
}: {
  memory: { addr: number; bytes: Uint8Array } | null;
  debug: DebugInfo;
  onPeek: (addr: number, len: number) => void;
}) {
  const [addrText, setAddrText] = useState("1200");

  const request = () => {
    const addr = Number.parseInt(addrText.replace(/^\$/, ""), 16);
    if (Number.isFinite(addr)) onPeek(addr & 0xffff, PEEK_BYTES);
  };

  return (
    <Pane
      title="Memory"
      action={
        <div className="flex items-center gap-1.5">
          <Input
            className="h-6 w-20 px-1.5 text-right font-mono text-[11px]"
            value={addrText}
            onChange={(e) => setAddrText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && request()}
            aria-label="memory address"
          />
          <Button size="xs" variant="ghost" onClick={request}>
            Read
          </Button>
        </div>
      }
    >
      {!memory ? (
        <PaneEmpty>Enter an address to read {PEEK_BYTES} bytes.</PaneEmpty>
      ) : (
        <div className="px-3 py-2 font-mono text-xs">
          {Array.from({ length: Math.ceil(memory.bytes.length / BYTES_PER_ROW) }, (_, row) => {
            const base = memory.addr + row * BYTES_PER_ROW;
            const slice = memory.bytes.slice(row * BYTES_PER_ROW, (row + 1) * BYTES_PER_ROW);
            const label = symbolAt(debug, base);
            return (
              <div key={row} className="flex gap-3 py-0.5">
                <span className="w-12 shrink-0 text-muted-foreground">
                  <Hex value={base} />
                </span>
                <span>
                  {Array.from(slice)
                    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
                    .join(" ")}
                </span>
                {label?.addr === base && <span className="text-symbol">{label.name}</span>}
              </div>
            );
          })}
        </div>
      )}
    </Pane>
  );
}

export function LogPane({ output, onClear }: { output: string; onClear: () => void }) {
  return (
    <Pane
      title="Output"
      action={
        <Button size="xs" variant="ghost" onClick={onClear} disabled={output === ""}>
          Clear
        </Button>
      }
    >
      {output ? (
        <pre className="px-3 py-2 font-mono text-xs whitespace-pre-wrap">{output}</pre>
      ) : (
        <PaneEmpty>The program has printed nothing yet.</PaneEmpty>
      )}
    </Pane>
  );
}

export function DiagnosticsPane({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <Pane
      title="Diagnostics"
      action={
        diagnostics.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">
            {diagnostics.length} {diagnostics.length === 1 ? "item" : "items"}
          </span>
        ) : null
      }
    >
      {diagnostics.length === 0 ? (
        <PaneEmpty>No diagnostics.</PaneEmpty>
      ) : (
        <ul className="divide-y">
          {diagnostics.map((d, i) => (
            <li key={i} className="px-3 py-2 text-xs">
              <div className="flex items-baseline gap-2">
                {d.code && (
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      d.severity === "error" ? "text-destructive" : "text-warning",
                    )}
                  >
                    {d.code}
                  </span>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {d.file}:{d.line}:{d.column}
                </span>
              </div>
              {/* The CLI's wording, unchanged (§5). */}
              <p className="mt-0.5">{d.message}</p>
              {d.note && <p className="mt-0.5 text-muted-foreground">{d.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </Pane>
  );
}

/** Where execution stopped, in source terms when the tables allow and
 *  in address terms when they do not. */
export function CurrentLocation({ ip, debug }: { ip: number | null; debug: DebugInfo }) {
  if (ip === null) return null;
  const row = lineAt(debug, ip);
  return (
    <span className="font-mono text-[11px] text-muted-foreground">
      <Hex value={ip} />
      {row && (
        <span className="ml-2">
          {row.file}:{row.line}
        </span>
      )}
    </span>
  );
}
