import type { LogEntry } from '@/hooks/use-vm-log'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import { IconButton } from '../ui/icon-button'
import { SectionCard } from '../section-card'
import {
  BrushCleaningIcon,
  CopyIcon,
  EyeClosedIcon,
  EyeIcon,
  Maximize2Icon,
} from 'lucide-react'
import { ScrollArea } from '../ui/scroll-area'
import { LogFilters } from '../log-filters'
//
//
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { fmt16 } from '@/lib/format'
//

const KIND_COLOR: Record<string, string> = {
  info: 'text-[color:var(--ctp-subtext0)]',
  read: 'text-[color:var(--ctp-subtext0)]',
  snapshot: 'text-[color:var(--ctp-sky)]',
  paused: 'text-[color:var(--ctp-peach)]',
  fault: 'text-[color:var(--ctp-red)]',
  tick: 'text-[color:var(--ctp-overlay1)]',
  mem: 'text-[color:var(--ctp-sapphire)]',
  poke: 'text-[color:var(--ctp-lavender)]',
  stack: 'text-[color:var(--ctp-teal)]',
  irq: 'text-[color:var(--ctp-peach)]',
  im: 'text-[color:var(--ctp-pink)]',
  bp: 'text-[color:var(--ctp-yellow)]',
  run: 'text-[color:var(--ctp-green)]',
  load: 'text-[color:var(--ctp-blue)]',
}

type LogPaneProps = {
  entries: LogEntry[]
  clear: () => void
  copy: () => void
  height?: number
  filters: Record<LogEntry['kind'], boolean>
  setFilters: (f: Record<LogEntry['kind'], boolean>) => void
}

export function LogPane({
  entries,
  clear,
  copy,
  height = 232,
  filters,
  setFilters,
}: LogPaneProps) {
  const [show, setShow] = useState(true)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dialogViewportRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = () => {
    // Only ever scroll the inner viewport to avoid bubbling scroll to ancestors
    const doScroll = () => {
      const vp1 = viewportRef.current
      if (vp1) vp1.scrollTop = vp1.scrollHeight
      const vp2 = dialogViewportRef.current
      if (vp2) vp2.scrollTop = vp2.scrollHeight
    }
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(doScroll)
    else doScroll()
  }

  useEffect(() => {
    scrollToBottom()
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [entries.length])

  return (
    <div className={cn(show ? '' : 'opacity-50')}>
      <SectionCard
        title="Logs"
        info="Structured VM events. Use filters to show kinds; copy, clear, or expand the view."
        actions={
          <div className="flex gap-2">
            <LogFilters filters={filters} setFilters={setFilters} />
            <IconButton
              variant="outline"
              label="Copy logs"
              icon={CopyIcon}
              onClick={copy}
            />
            <IconButton
              variant="outline"
              label="Clear logs"
              icon={BrushCleaningIcon}
              onClick={clear}
            />
            <IconButton
              variant="outline"
              label={show ? 'Hide logs' : 'Show logs'}
              icon={show ? EyeClosedIcon : EyeIcon}
              onClick={() => setShow((s) => !s)}
            />
            <Sheet modal={false}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SheetTrigger asChild>
                    <IconButton
                      asChild
                      variant="outline"
                      label="Expand logs"
                      icon={Maximize2Icon}
                    />
                  </SheetTrigger>
                </TooltipTrigger>
                <TooltipContent>Expand logs</TooltipContent>
              </Tooltip>
              <SheetContent side="right">
                <SheetHeader>
                  <SheetTitle>Logs</SheetTitle>
                </SheetHeader>
                <div className="flex items-center gap-2 px-4">
                  <LogFilters filters={filters} setFilters={setFilters} />
                  <IconButton
                    variant="outline"
                    label="Copy logs"
                    icon={CopyIcon}
                    onClick={copy}
                  />
                  <IconButton
                    variant="outline"
                    label="Clear logs"
                    icon={BrushCleaningIcon}
                    onClick={clear}
                  />
                </div>
                <ScrollArea
                  className="px-3"
                  style={{ height: '70vh' }}
                  viewportRef={dialogViewportRef}
                >
                  <div>
                    {entries.map((e) => (
                      <LogRow key={e.id} entry={e} />
                    ))}
                    <div ref={bottomRef} />
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        }
      >
        {show && (
          <ScrollArea
            className="px-3"
            style={{ height }}
            viewportRef={viewportRef}
          >
            <div>
              {entries.map((e) => (
                <LogRow key={e.id} entry={e} />
              ))}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}
      </SectionCard>
    </div>
  )
}

type LogRowProps = {
  entry: LogEntry
}

function LogRow({ entry }: LogRowProps) {
  const ts = new Date(entry.t)
  const hh = ts.getHours().toString().padStart(2, '0')
  const mm = ts.getMinutes().toString().padStart(2, '0')
  const ss = ts.getSeconds().toString().padStart(2, '0')
  const ms = ts.getMilliseconds().toString().padStart(3, '0')

  const color = KIND_COLOR[entry.kind] ?? 'text-zinc-300'

  const renderDetails = (e: LogEntry) => {
    switch (e.kind) {
      case 'paused': {
        const { reason, ip } = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">reason</span>
              <span>{reason}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">ip</span>
              <span>{fmt16(ip)}</span>
            </span>
          </div>
        )
      }
      case 'load': {
        const { size, start, entry } = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">size</span>
              <span>{size}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">start</span>
              <span>{fmt16(start)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">entry</span>
              <span>{fmt16(entry)}</span>
            </span>
          </div>
        )
      }
      case 'mem': {
        const { addr, len } = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">addr</span>
              <span>{fmt16(addr)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">len</span>
              <span>{len}</span>
            </span>
          </div>
        )
      }
      case 'poke': {
        const { addr, len } = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">addr</span>
              <span>{fmt16(addr)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">len</span>
              <span>{len}</span>
            </span>
          </div>
        )
      }
      case 'fault': {
        const { msg, code, meta } = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {code && (
              <span className="inline-flex items-center gap-1 rounded bg-destructive/20 px-1.5 py-0.5 text-destructive">
                <span className="opacity-80">code</span>
                <span>{code}</span>
              </span>
            )}
            {msg && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                <span className="opacity-60">msg</span>
                <span>{msg}</span>
              </span>
            )}
            {meta && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                <span className="opacity-60">meta</span>
                <span className="opacity-80">
                  {Object.keys(meta).slice(0, 3).join(', ')}
                  {Object.keys(meta).length > 3 ? ', …' : ''}
                </span>
              </span>
            )}
          </div>
        )
      }
      case 'snapshot': {
        const s = e.details
        return (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">ip</span>
              <span>{fmt16(s.ip)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">sp</span>
              <span>{fmt16(s.sp)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <span className="opacity-60">fp</span>
              <span>{fmt16(s.fp)}</span>
            </span>
          </div>
        )
      }
      case 'output':
        // What the program itself printed. Set apart from the lab's own
        // lines, so a program printing `[error]` still reads as output.
        return (
          <span className="font-mono whitespace-pre-wrap text-foreground">
            {e.details.text.replace(/\n$/, '')}
          </span>
        )
      case 'error':
        return (
          <span className="font-mono text-destructive">{e.details.msg}</span>
        )
      default:
        return null
    }
  }

  const content =
    'details' in entry && entry.details ? (
      renderDetails(entry)
    ) : (
      <span>{entry.summary}</span>
    )

  return (
    <div className="grid grid-cols-[6.25rem_5rem_1fr] border-b border-zinc-900 text-xs">
      <span className="opacity-60 h-[36px] flex items-center">
        {hh}:{mm}:{ss}.{ms}
      </span>
      <span data-log-kind className={cn('h-[36px] flex items-center', color)}>
        {entry.kind}
      </span>
      <div className="h-[36px] flex items-center gap-2 overflow-hidden pr-2">
        {content}
      </div>
    </div>
  )
}
