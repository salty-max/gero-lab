/**
 * The cockpit's panes (gero-lab.md §6).
 *
 * Every value shown here came out of a worker event. Nothing decodes an
 * instruction, resolves a symbol from an image, or computes a flag —
 * the disassembly text, the debug tables and the register file all
 * arrive already formed.
 */

import { useState } from "react";

import { Button, Empty, Hex, Pane, cn } from "../ui/primitives.js";
import { lineAt, symbolAt, type DebugInfo } from "../worker/debug.js";
import type { Diagnostic, Registers } from "../worker/protocol.js";

const REGISTER_ORDER: (keyof Registers)[] = [
  "ip", "acu", "r1", "r2", "r3", "r4", "r5", "r6",
  "r7", "r8", "sp", "fp", "mb", "im", "flg",
];

/** `flg`'s bits, low to high. Bits 5–15 read as zero — the VM masks
 *  them on write — so showing them would be showing a constant. */
const FLAGS = ["Z", "C", "V", "N", "I"] as const;

export function RegisterPane({
  regs,
  onSetReg,
}: {
  regs: Registers | null;
  onSetReg: (index: number, value: number) => void;
}) {
  if (!regs) return <Pane title="Registers"><Empty>Build a program to see the register file.</Empty></Pane>;

  return (
    <Pane title="Registers">
      <table className="w-full text-xs">
        <tbody>
          {REGISTER_ORDER.map((name, index) => (
            <tr key={name} className="border-b border-slate-800/60 last:border-0">
              <th className="w-16 px-3 py-1 text-left font-mono font-normal text-slate-500">
                {name}
              </th>
              <td className="px-3 py-1 text-slate-200">
                <input
                  className="w-20 bg-transparent font-mono tabular-nums outline-none focus:text-sky-300"
                  value={`$${regs[name].toString(16).toUpperCase().padStart(4, "0")}`}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value.replace(/^\$/, ""), 16);
                    if (Number.isFinite(parsed)) onSetReg(index, parsed & 0xffff);
                  }}
                  aria-label={`register ${name}`}
                />
              </td>
              <td className="px-3 py-1 text-right font-mono tabular-nums text-slate-500">
                {regs[name]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 border-t border-slate-800 px-3 py-2 text-[10px] font-mono">
        {FLAGS.map((flag, bit) => (
          <span
            key={flag}
            className={cn(
              "rounded px-1.5 py-0.5",
              regs.flg & (1 << bit) ? "bg-sky-900 text-sky-200" : "bg-slate-800 text-slate-600",
            )}
          >
            {flag}
          </span>
        ))}
      </div>
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
    return <Pane title="Disassembly"><Empty>Build a program to disassemble it.</Empty></Pane>;
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
      right={
        debug.present ? null : (
          <span className="text-[10px] text-amber-500/80">no debug info — addresses only</span>
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
                <div className="px-3 pt-2 text-[11px] text-emerald-400/80">{label.name}:</div>
              )}
              <button
                type="button"
                disabled={row.addr === null}
                onClick={() => row.addr !== null && onToggleBreakpoint(row.addr)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-0.5 text-left",
                  isCurrent && "bg-sky-950/70 text-sky-200",
                  !isCurrent && "hover:bg-slate-800/60",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-2 w-2 shrink-0 rounded-full",
                    hasBp ? "bg-rose-500" : "bg-transparent",
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
    if (Number.isFinite(addr)) onPeek(addr & 0xffff, 128);
  };

  return (
    <Pane
      title="Memory"
      right={
        <div className="flex items-center gap-1.5">
          <input
            className="w-20 rounded bg-slate-800 px-1.5 py-0.5 text-right font-mono text-[11px] outline-none focus:ring-1 focus:ring-sky-600"
            value={addrText}
            onChange={(e) => setAddrText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && request()}
            aria-label="memory address"
          />
          <Button variant="ghost" onClick={request}>Read</Button>
        </div>
      }
    >
      {!memory ? (
        <Empty>Enter an address to read 128 bytes.</Empty>
      ) : (
        <div className="px-3 py-2 font-mono text-xs">
          {Array.from({ length: Math.ceil(memory.bytes.length / 16) }, (_, row) => {
            const base = memory.addr + row * 16;
            const slice = memory.bytes.slice(row * 16, row * 16 + 16);
            const label = symbolAt(debug, base);
            return (
              <div key={row} className="flex gap-3 py-0.5">
                <span className="w-12 shrink-0 text-slate-600"><Hex value={base} /></span>
                <span className="text-slate-300">
                  {Array.from(slice)
                    .map((b) => b.toString(16).toUpperCase().padStart(2, "0"))
                    .join(" ")}
                </span>
                {label?.addr === base && (
                  <span className="text-emerald-500/70">{label.name}</span>
                )}
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
      right={<Button variant="ghost" onClick={onClear}>Clear</Button>}
    >
      {output ? (
        <pre className="whitespace-pre-wrap px-3 py-2 font-mono text-xs text-slate-200">
          {output}
        </pre>
      ) : (
        <Empty>The program has printed nothing yet.</Empty>
      )}
    </Pane>
  );
}

export function DiagnosticsPane({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <Pane
      title="Diagnostics"
      right={
        diagnostics.length > 0 ? (
          <span className="text-[10px] text-slate-600">
            {diagnostics.length} {diagnostics.length === 1 ? "item" : "items"}
          </span>
        ) : null
      }
    >
      {diagnostics.length === 0 ? (
        <Empty>No diagnostics.</Empty>
      ) : (
        <ul className="divide-y divide-slate-800/60">
          {diagnostics.map((d, i) => (
            <li key={i} className="px-3 py-2 text-xs">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    d.severity === "warning" ? "text-amber-400" : "text-rose-400",
                  )}
                >
                  {d.code}
                </span>
                {d.file && (
                  <span className="font-mono text-[10px] text-slate-500">
                    {d.file}
                    {d.line !== undefined && `:${d.line}`}
                    {d.column !== undefined && `:${d.column}`}
                  </span>
                )}
              </div>
              {/* The CLI's wording, unchanged (§5). */}
              <p className="mt-0.5 text-slate-300">{d.message}</p>
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
    <span className="font-mono text-[11px] text-slate-400">
      <Hex value={ip} />
      {row && <span className="ml-2 text-slate-500">{row.file}:{row.line}</span>}
    </span>
  );
}
