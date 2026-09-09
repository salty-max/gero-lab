import { useVM } from '@/contexts/vm-context'
import { fmt16, fmt8, u16 } from '@/lib/format'
import { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../section-card'
import { cn } from '@/lib/utils'
import { FlagTriangleRightIcon } from 'lucide-react'

type StackPaneProps = { highlightAddrs?: number[] }

const ROW = 8
const ROWS = 16
const WINDOW_LEN = ROW * ROWS // 128
const STACK_TOP_LAST_ROW_START = 0xfff8
const INITIAL_BASE = u16(STACK_TOP_LAST_ROW_START - (ROWS - 1) * ROW) // 0xFF80

export function StackPane({ highlightAddrs }: StackPaneProps) {
  const vm = useVM()
  const { peek, memSize: readMemSize } = vm
  const sp = u16(vm.snap?.sp ?? 0)
  const fp = u16(vm.snap?.fp ?? 0)
  const ip = u16(vm.snap?.ip ?? 0)

  const [memSize, setMemSize] = useState(0)
  const [buf, setBuf] = useState<Uint8Array | null>(null)

  const base = INITIAL_BASE

  useEffect(() => {
    let off = false
    readMemSize()
      .then((n) => !off && setMemSize(n))
      .catch(() => !off && setMemSize(0))
    return () => {
      off = true
    }
  }, [readMemSize])

  useEffect(() => {
    let off = false
    peek(base, WINDOW_LEN)
      .then((d) => {
        if (!off) {
          setBuf(d)
        }
      })
      .catch(() => {
        if (!off) {
          setBuf(null)
        }
      })
    return () => {
      off = true
    }
  }, [peek, base, sp, fp, ip])

  const rows = useMemo(() => {
    if (!buf) return []
    const list: { addr: number; bytes: number[] }[] = []
    for (let i = 0; i < WINDOW_LEN; i += ROW) {
      const abs = base + i
      if (memSize && abs >= memSize) break
      list.push({ addr: abs, bytes: Array.from(buf.slice(i, i + ROW)) })
    }
    return list
  }, [buf, base, memSize])

  // ----- frame highlight (down-growing stack) -----
  // Locals live in (SP, FP] because push writes at SP then decrements SP.
  // Saved RA/regs live above FP (FP+4...), so we don't tint those as locals.

  const isSp = (addr: number) => u16(addr) === sp
  const isFp = (addr: number) => u16(addr) === fp
  const isHighlight = (addr: number) =>
    highlightAddrs?.some((a) => u16(a) === u16(addr)) ?? false

  const inFrame = (addr: number, inited: boolean) => {
    if (!inited) return false
    if (sp === 0 || fp === 0) return false
    // Require sane ordering (down-growing stack)
    if (sp > fp) return false
    // Locals occupy addresses strictly greater than SP and up to FP inclusive
    return addr > sp && addr <= fp
  }

  return (
    <SectionCard
      title="Stack"
      info="Down-growing stack. Highlights the current frame between SP and FP; markers show SP and FP."
    >
      <div className="h-full overflow-auto">
        {rows.map((r) => (
          <div
            key={r.addr}
            className="grid grid-cols-[5rem_1fr] py-1 border-b border-zinc-900 text-sm"
          >
            <div className="opacity-60 tabular-nums">{fmt16(r.addr)}</div>
            <div className="grid grid-cols-8 gap-1">
              {r.bytes.map((b, i) => {
                const a = u16(r.addr + i)
                const oob = memSize ? r.addr + i >= memSize : false
                const text = oob ? '__' : fmt8(b, true)

                return (
                  <span
                    key={`cell-${String(a)}`}
                    className={cn(
                      'relative shrink-0 w-6 inline-block text-center font-mono tabular-nums rounded',
                      oob ? 'text-muted' : '',
                      inFrame(a, true) && 'bg-gero/20',
                      isHighlight(a) && 'ring-1 ring-gero/50',
                      isFp(a) && 'outline-1 outline-cyan-400',
                      isSp(a) && 'outline-1 outline-gero'
                    )}
                    title={isFp(a) ? 'FP' : isSp(a) ? 'SP' : undefined}
                  >
                    {text}
                    {isFp(a) && (
                      <FlagTriangleRightIcon className="w-3 h-3 absolute -left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                    )}
                    {isSp(a) && (
                      <FlagTriangleRightIcon className="w-3 h-3 absolute -left-3 top-1/2 -translate-y-1/2 text-gero" />
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
