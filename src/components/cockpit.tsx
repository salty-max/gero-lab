/**
 * The cockpit: editor, transport, panes.
 *
 * Layout follows the source application — editor above, panes below,
 * transport between them — with the panes wired to worker events.
 */

import { useEffect, useState } from "react";

import { loadSamples, type Sample } from "../samples.js";
import { useSession } from "../state/session.js";
import { Button, Empty, cn } from "../ui/primitives.js";
import { addrOfLine, lineAt } from "../worker/debug.js";
import type { SourceFile } from "../worker/protocol.js";
import {
  CurrentLocation,
  DiagnosticsPane,
  DisassemblyPane,
  LogPane,
  MemoryPane,
  RegisterPane,
} from "./panes.js";
import { Editor } from "./editor.js";

/** What the editor holds: a sample's files, with the edits made to
 *  them. Switching samples replaces it wholesale — the lab is a
 *  playground, not a workspace with unsaved work to protect. */
interface Buffer {
  sample: Sample;
  files: SourceFile[];
  open: string;
}

const asBuffer = (sample: Sample): Buffer => ({
  sample,
  files: sample.files,
  open: sample.entry,
});

/** How long a buffer must sit still before it is checked. Long enough
 *  that typing a word is one check, short enough to feel immediate. */
const CHECK_DEBOUNCE_MS = 300;

export function Cockpit() {
  const session = useSession();
  const [samples, setSamples] = useState<Sample[] | null>(null);
  const [samplesError, setSamplesError] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<Buffer | null>(null);

  useEffect(() => {
    loadSamples()
      .then((loaded) => {
        setSamples(loaded);
        if (loaded[0]) setBuffer(asBuffer(loaded[0]));
      })
      .catch((err: unknown) =>
        setSamplesError(err instanceof Error ? err.message : String(err)),
      );
  }, []);

  const currentIp = session.pause?.ip ?? session.regs?.ip ?? null;
  const currentLine = currentIp === null ? null : lineAt(session.debug, currentIp);

  const toggleBreakpointAt = (addr: number) => {
    session.setBreakpoints(
      session.breakpoints.includes(addr)
        ? session.breakpoints.filter((a) => a !== addr)
        : [...session.breakpoints, addr],
    );
  };

  /** Clicking a source line sets a breakpoint when the line table maps
   *  it. A line that produced no code has no address, so the gutter
   *  stays inert rather than pretending. */
  const toggleBreakpointAtLine = (file: string, line: number) => {
    const addr = addrOfLine(session.debug, file, line);
    if (addr !== null) toggleBreakpointAt(addr);
  };

  const edit = (text: string) => {
    setBuffer((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            files: prev.files.map((f) => (f.name === prev.open ? { ...f, text } : f)),
          },
    );
  };

  // Diagnostics follow the buffer rather than the last build (§5). The
  // debounce is what keeps a held key from queueing one check per
  // keystroke behind the run loop.
  useEffect(() => {
    if (!buffer) return;
    const timer = setTimeout(
      () => session.check(buffer.files, buffer.sample.entry, buffer.sample.lang),
      CHECK_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [buffer, session.check]);

  if (session.phase === "failed" || samplesError) {
    return (
      <Failure
        title={samplesError ? "The samples did not load" : "The engine did not start"}
        detail={samplesError ?? session.connectionError ?? ""}
      />
    );
  }

  if (!buffer || !samples) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>Loading the toolchain…</Empty>
      </div>
    );
  }

  const open = buffer.files.find((f) => f.name === buffer.open) ?? buffer.files[0]!;

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,2fr)_auto_minmax(0,3fr)] gap-3 p-3">
      <Editor
        samples={samples}
        buffer={buffer}
        open={open}
        currentLine={currentLine}
        breakpoints={session.breakpoints}
        debug={session.debug}
        onChooseSample={(s) => setBuffer(asBuffer(s))}
        onOpenFile={(name) => setBuffer({ ...buffer, open: name })}
        diagnostics={session.diagnostics}
        onEdit={edit}
        onToggleBreakpoint={toggleBreakpointAtLine}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2">
        <Button
          onClick={() =>
            session.build(buffer.files, buffer.sample.entry, buffer.sample.lang)
          }
        >
          Build
        </Button>
        <Button onClick={session.run} disabled={session.phase === "running"}>Run</Button>
        <Button onClick={session.pauseRun} disabled={session.phase !== "running"}>Pause</Button>
        <Button onClick={() => session.step()}>Step</Button>
        <Button variant="ghost" onClick={session.reset}>Reset</Button>
        <div className="ml-auto flex items-center gap-3">
          {session.pause && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
                session.pause.reason === "fault"
                  ? "bg-rose-900 text-rose-200"
                  : "bg-slate-800 text-slate-400",
              )}
            >
              {session.pause.reason}
              {session.pause.fault !== undefined && ` $${session.pause.fault.toString(16)}`}
            </span>
          )}
          <CurrentLocation ip={currentIp} debug={session.debug} />
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-3">
        <RegisterPane regs={session.regs} onSetReg={session.setReg} />
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <DisassemblyPane
            text={session.disassembly}
            debug={session.debug}
            currentIp={currentIp}
            breakpoints={session.breakpoints}
            onToggleBreakpoint={toggleBreakpointAt}
          />
          <MemoryPane memory={session.memory} debug={session.debug} onPeek={session.peek} />
        </div>
        <div className="grid min-h-0 grid-rows-2 gap-3">
          <LogPane output={session.output} onClear={session.clearOutput} />
          <DiagnosticsPane diagnostics={session.diagnostics} />
        </div>
      </div>
    </div>
  );
}

function Failure({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded border border-rose-900 bg-rose-950/40 p-4">
        <h2 className="text-sm font-semibold text-rose-200">{title}</h2>
        <p className="mt-2 text-xs text-rose-300/80">{detail}</p>
      </div>
    </div>
  );
}
