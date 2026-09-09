import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeftIcon, FlagTriangleRightIcon } from 'lucide-react'
import type React from 'react'

import { useVM } from '@/contexts/vm-context'
import { useProgram } from '@/contexts/program-context'
import { fmt16 } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SectionCard } from '../section-card'
import { ScrollArea } from '../ui/scroll-area'
import { AssemblyOptions } from '../assembly-options'

/* ----------------------------- Row model ----------------------------- */

/**
 * One line of the module's disassembly.
 *
 * `gero_disasm` returns annotated assembly — an address gutter, an
 * entry marker, and symbol names in place of raw addresses — so a row
 * is one of its lines with the address read off the front. Nothing here
 * decodes an instruction (§11): the address is what makes a line
 * clickable, and the module put it there.
 */
type Row = {
  addr: number | null
  text: string
  /** A line the disassembler emitted as a comment — a padding run, a
   *  data block, the truncation note. */
  isComment: boolean
}

const ADDRESSED_LINE = /^([0-9A-Fa-f]{4}):\s+(.*)$/

function toRows(disassembly: string): Row[] {
  return disassembly
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = ADDRESSED_LINE.exec(line)
      if (!match) return { addr: null, text: line, isComment: true }
      const text = match[2]!
      return {
        addr: Number.parseInt(match[1]!, 16),
        text,
        isComment: text.trimStart().startsWith(';'),
      }
    })
}

/* ----------------------------- Row view ----------------------------- */

type AssemblyPaneProps = {
  breakpoints: number[]
  onToggleBreakpoint: (addr: number) => void
}

type InstructionRowProps = {
  row: Row
  isBreakpoint: boolean
  isCurrent: boolean
  onDoubleClick?: () => void
  currentRef?: React.Ref<HTMLDivElement>
}

function InstructionRow({
  row,
  isBreakpoint,
  isCurrent,
  onDoubleClick,
  currentRef,
}: InstructionRowProps) {
  const addressable = row.addr !== null && !row.isComment

  return (
    <div
      ref={isCurrent ? currentRef : undefined}
      className={cn(
        'relative grid grid-cols-[5.5rem_auto] gap-3 px-2 py-1 rounded text-sm',
        addressable && 'cursor-pointer hover:bg-secondary',
        isBreakpoint ? 'bg-gero/30' : '',
        row.isComment && 'opacity-75 italic'
      )}
      onDoubleClick={addressable ? onDoubleClick : undefined}
    >
      {isBreakpoint && !isCurrent && (
        <div className="absolute z-10 top-0 left-0 w-full h-full">
          <FlagTriangleRightIcon className="w-4 absolute right-1 top-1/2 -translate-y-1/2 text-gero" />
        </div>
      )}

      {isCurrent && (
        <div className="absolute z-10 inset-0 rounded border border-gero">
          <ChevronLeftIcon className="w-5 absolute right-1 top-1/2 -translate-y-1/2 text-gero" />
        </div>
      )}

      <span
        className={cn(
          'shrink-0 tabular-nums',
          isBreakpoint ? 'text-gero' : 'opacity-60'
        )}
      >
        {row.addr === null ? '' : `${fmt16(row.addr, true)}:`}
      </span>

      <span
        className={cn(
          'whitespace-pre',
          isCurrent ? 'text-primary font-semibold' : 'text-muted-foreground'
        )}
      >
        {row.text}
      </span>
    </div>
  )
}

/* --------------------------- Component --------------------------- */

const STORAGE_KEY = 'gero:assembly:opts:v1'

export function AssemblyPane({
  breakpoints,
  onToggleBreakpoint,
}: AssemblyPaneProps) {
  const vm = useVM()
  const program = useProgram()
  const [codeOnly, setCodeOnly] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const obj = JSON.parse(raw) as Record<string, unknown>
      return typeof obj.codeOnly === 'boolean' ? obj.codeOnly : false
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ codeOnly }))
    } catch {
      // A refusing store costs the preference, not the pane.
    }
  }, [codeOnly])

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const currentRowRef = useRef<HTMLDivElement | null>(null)
  const currentIP = vm.snap?.ip ?? 0

  const rows = useMemo(() => {
    const all = toRows(program.lastBuild?.disassembly ?? '')
    return codeOnly ? all.filter((r) => !r.isComment) : all
  }, [program.lastBuild, codeOnly])

  // Follow the current instruction as it moves.
  useEffect(() => {
    const vp = viewportRef.current
    const el = currentRowRef.current
    if (!vp || !el) return

    const vpRect = vp.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const margin = 8
    const above = elRect.top < vpRect.top + margin
    const below = elRect.bottom > vpRect.bottom - margin
    if (above || below) {
      const offset =
        elRect.top - vpRect.top - (vp.clientHeight / 2 - el.clientHeight / 2)
      vp.scrollTo({ top: Math.max(0, vp.scrollTop + offset), behavior: 'smooth' })
    }
  }, [currentIP, rows])

  return (
    <SectionCard
      title="Disassembly"
      info="The module's own disassembly. Double-click a row to toggle a breakpoint; the current instruction is highlighted."
      className="max-h-[550px]"
      actions={
        <div className="flex items-center justify-end">
          <AssemblyOptions codeOnly={codeOnly} setCodeOnly={(v) => setCodeOnly(Boolean(v))} />
        </div>
      }
    >
      <ScrollArea viewportRef={viewportRef}>
        <div className="space-y-0.5 max-h-[448px]">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm text-center py-4">
              {vm.ready ? 'Assemble a program to disassemble it' : 'VM not ready'}
            </div>
          ) : (
            rows.map((row, i) => (
              <InstructionRow
                key={row.addr === null ? `line-${String(i)}` : `addr-${String(row.addr)}`}
                row={row}
                isBreakpoint={row.addr !== null && breakpoints.includes(row.addr)}
                isCurrent={row.addr === currentIP && !row.isComment}
                currentRef={currentRowRef}
                onDoubleClick={() => {
                  if (row.addr !== null) onToggleBreakpoint(row.addr)
                }}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </SectionCard>
  )
}
