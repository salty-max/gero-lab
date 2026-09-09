/**
 * The cockpit: editor, transport, panes.
 *
 * Layout follows the source application — editor above, panes below,
 * transport between them — with the panes wired to worker events.
 */

import { useEffect, useMemo } from "react";
import { Pause, Play, RotateCcw, SkipForward, Wrench } from "lucide-react";

import { Editor } from "@/components/editor";
import {
  CurrentLocation,
  DiagnosticsPane,
  DisassemblyPane,
  LogPane,
  MemoryPane,
  RegisterPane,
} from "@/components/panes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ShareButton } from "@/components/share-button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { usePersistedSession } from "@/state/persisted-session";
import { useSession } from "@/state/session";
import { Persistence, browserStore } from "@/state/storage";
import { useWorkspace } from "@/state/workspace";
import { addrOfLine, lineAt } from "@/worker/debug";

/** How long a buffer must sit still before it is checked. Long enough
 *  that typing a word is one check, short enough to feel immediate. */
const CHECK_DEBOUNCE_MS = 300;

export function Cockpit() {
  const session = useSession();
  const { build, check, writeSram } = session;
  // One store for the page: the hooks below would otherwise each build
  // their own and re-run every render.
  const persistence = useMemo(() => new Persistence(browserStore()), []);
  const workspace = useWorkspace(persistence);
  const { buffer, samples } = workspace;

  usePersistedSession(session, buffer?.entry ?? null, persistence);

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

  /** Build, then hand back the banks this program saved last time.
   *
   *  The worker queues commands behind one another, so the restore is
   *  dispatched after the build has loaded the image it belongs to —
   *  no event needed to sequence them. The module refuses a save whose
   *  length does not match, which is what keeps one program's banks out
   *  of another's. */
  const buildAndRestoreSram = () => {
    if (!buffer) return;
    build(buffer.files, buffer.entry, buffer.lang);
    const saved = persistence.loadSram(buffer.entry);
    if (saved) writeSram(saved);
  };

  // Diagnostics follow the buffer rather than the last build (§5). The
  // debounce is what keeps a held key from queueing one check per
  // keystroke behind the run loop.
  useEffect(() => {
    if (!buffer) return;
    const timer = setTimeout(
      () => { check(buffer.files, buffer.entry, buffer.lang); },
      CHECK_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [buffer, check]);

  if (session.phase === "failed") {
    return <Failure title="The engine did not start" detail={session.connectionError ?? ""} />;
  }

  if (!buffer) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyTitle>Loading the toolchain…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  const open = buffer.files.find((f) => f.name === buffer.open) ?? buffer.files[0]!;

  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,2fr)_auto_auto_minmax(0,3fr)] gap-3 p-3">
      <Editor
        samples={samples}
        buffer={buffer}
        open={open}
        currentLine={currentLine}
        breakpoints={session.breakpoints}
        debug={session.debug}
        diagnostics={session.diagnostics}
        onChooseSample={workspace.chooseSample}
        onOpenFile={workspace.openFile}
        onEdit={workspace.edit}
        onToggleBreakpoint={toggleBreakpointAtLine}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-foreground/10">
        <Button size="sm" onClick={() => { buildAndRestoreSram(); }}>
          <Wrench />
          Build
        </Button>
        <ButtonGroup>
          <Button
            size="sm"
            variant="outline"
            onClick={session.run}
            disabled={session.phase === "running"}
          >
            <Play />
            Run
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={session.pauseRun}
            disabled={session.phase !== "running"}
          >
            <Pause />
            Pause
          </Button>
          <Button size="sm" variant="outline" onClick={() => session.step()}>
            <SkipForward />
            Step
          </Button>
        </ButtonGroup>
        <Button size="sm" variant="ghost" onClick={session.reset}>
          <RotateCcw />
          Reset
        </Button>
        <ShareButton buffer={buffer} />

        <div className="ml-auto flex items-center gap-3">
          {session.pause && (
            <Badge
              variant={session.pause.reason === "fault" ? "destructive" : "secondary"}
              className="text-[10px] tracking-wider uppercase"
            >
              {session.pause.reason}
              {session.pause.fault !== undefined && ` $${session.pause.fault.toString(16)}`}
            </Badge>
          )}
          <Separator orientation="vertical" className="h-4" />
          <CurrentLocation ip={currentIp} debug={session.debug} />
        </div>
      </div>

      {/* A link that would not decode, or samples that would not load.
          Neither stops the lab opening on something else, so it is a
          notice rather than a dead end. */}
      {workspace.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          {workspace.error}
        </p>
      )}

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
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle className="text-destructive">{title}</EmptyTitle>
        <EmptyDescription>{detail}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
