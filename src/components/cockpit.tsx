import { useProgram } from '@/contexts/program-context'
import { useVM } from '@/contexts/vm-context'
import { RegistersPane } from './panes/register-pane'
import { MemoryPane } from './panes/memory-pane'
import { useState } from 'react'
import { u16 } from '@/lib/format'
import { LogPane } from './panes/log-pane'
import { useVMLog } from '@/hooks/use-vm-log'
import { AssemblyPane } from './panes/assembly-pane'
import { cn } from '@/lib/utils'
import { ScrollArea } from './ui/scroll-area'
import { StackPane } from './panes/stack-pane'
import { ProgramEditor } from './program-editor'
import { ToolBar } from './toolbar'
import { Loader2Icon } from 'lucide-react'

export function Cockpit() {
  const vm = useVM()
  const program = useProgram()
  const entry = program.entryAddress
  /** Where the user jumped, and which program they jumped in. A jump
   *  made against an older image is not carried into the next one. */
  const [jump, setJump] = useState<{ forEntry: number | null; addr: number } | null>(null)

  // The view follows the program: a `.gr` image sits at its `org`, and
  // a view pinned to 0x0000 is a screen of zeros.
  const memBase =
    jump && jump.forEntry === entry ? jump.addr : u16((entry ?? 0) & 0xfff0)

  const log = useVMLog(
    vm.on,
    { includeTick: false, tickSample: 64, max: 1000 },
    vm.ready
  )

  // Determine whether a program is considered "loaded".
  // We rely on the presence of an initial snapshot; prior to the first
  // snapshot the UI is blurred & an overlay is shown.
  const loaded = vm.snap != null

  if (!vm.ready) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-background">
        <Loader2Icon className="animate-spin w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col bg-background min-h-0 h-full">
      <div className="px-6 py-4 shrink-0 bg-background">
        <ToolBar />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <main className={cn('relative px-6 pb-4')}>
          <div
            className={cn(
              'flex flex-col gap-3 h-full transition-all duration-200',
              // Apply visual de-emphasis when not loaded
              !loaded && 'blur-sm pointer-events-none select-none'
            )}
          >
            <div className="grid grid-rows-1  xl:grid-rows-2 2xl:grid-rows-none 2xl:grid-cols-2 gap-3">
              <MemoryPane
                base={memBase}
                length={256}
                highlightAddrs={[vm.snap?.ip, vm.snap?.fp].filter(
                  (x): x is number => typeof x === 'number'
                )}
                onJump={(addr) => {
                  setJump({ forEntry: entry, addr: u16(addr) })
                }}
              />
              <div
                className="grid grid-rows-2 md:grid-rows-none md:grid-cols-2
                2xl:grid-rows-none 2xl:grid-cols-2 gap-3"
              >
                <StackPane />
                <AssemblyPane
                  breakpoints={vm.breakpoints}
                  onToggleBreakpoint={vm.toggleBreakpoint}
                />
              </div>
            </div>
            <div className="grid grid-rows-2 md:grid-rows-none md:grid-cols-2 gap-3">
              <RegistersPane
                regs={vm.snap?.regs ?? null}
                onEdit={(name, value) => vm.setReg(name, value)}
              />
              <LogPane
                entries={log.filteredEntries}
                clear={log.clear}
                copy={log.copytoClipboard}
                filters={log.filters}
                setFilters={log.setFilters}
              />
            </div>
          </div>
        </main>
      </ScrollArea>

      {!loaded && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-background/70 backdrop-blur-sm">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">No program loaded</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Use the &quot;Load Program&quot; button to create or load a
              program. The cockpit will update once the first snapshot
              arrives.
            </p>
          </div>
          <ProgramEditor />
        </div>
      )}
    </div>
  )
}
