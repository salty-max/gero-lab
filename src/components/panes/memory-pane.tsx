import { useVM } from '@/contexts/vm-context'
import { fmt16, fmt8, u16 } from '@/lib/format'
import { useEffect, useMemo, useState } from 'react'
import { SectionCard } from '../section-card'
import { Label } from '../ui/label'
import { cn } from '@/lib/utils'
import { HexInput } from '../ui/hex-input'
import { Separator } from '../ui/separator'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'

type MemoryPaneProps = {
  base: number
  length: number
  highlightAddrs?: number[]
  onJump: (addr: number) => void
}

export function MemoryPane({
  base,
  length,
  highlightAddrs,
  onJump,
}: MemoryPaneProps) {
  const vm = useVM()
  const [buf, setBuf] = useState<Uint8Array | null>(null)
  const [memSize, setMemSize] = useState<number>(0)

  useEffect(() => {
    vm.memSize()
      .then(setMemSize)
      .catch(() => setMemSize(0))
    vm.peek(base, length)
      .then((d) => {
        setBuf(d)
      })
      .catch(() => {
        setBuf(null)
      })
  }, [vm, base, length])

  // Refresh on memory writes within our visible window
  useEffect(() => {
    const off = vm.on('poke', (e) => {
      const start = base
      const end = base + length - 1
      const eStart = e.addr >>> 0
      const eEnd = (e.addr + Math.max(0, e.len - 1)) >>> 0
      const overlaps = !(eEnd < start || eStart > end)
      if (!overlaps) return
      vm.peek(base, length)
        .then((d) => { setBuf(d) })
        .catch(() => {
          setBuf(null)
        })
    })
    return () => {
      try {
        off()
      } catch {
        // ignore
      }
    }
  }, [vm, base, length])

  const rows = useMemo(() => {
    if (!buf) return []
    const list: { addr: number; bytes: number[] }[] = []
    for (let i = 0; i < buf.length; i += 16) {
      const abs = base + i
      if (memSize && abs >= memSize) break
      list.push({
        addr: abs,
        bytes: Array.from(buf.slice(i, i + 16)),
      })
    }
    return list
  }, [buf, base, memSize])

  const isHighlight = (addr: number) =>
    highlightAddrs?.some((a) => u16(a) === u16(addr))

  const isAscii = (b: number) => b >= 32 && b <= 126

  return (
    <SectionCard
      title="Memory"
      info="View a window of memory in hex and ASCII. Use Jump @ to navigate; arrows page by 256 bytes."
      className="max-h-[550px] md:max-h-full"
      actions={
        <div className="flex items-stretch h-full gap-4">
          <div className="flex items-center gap-2">
            <Label>Jump @</Label>
            <HexInput
              name="memBase"
              value={fmt16(base, true)}
              onEnter={(s) => {
                const v = parseInt(s || '0', 16)
                if (!Number.isNaN(v)) onJump(u16(v))
              }}
            />
          </div>
          <Separator orientation="vertical" />
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">View from</span>
            <span className="text-gero">{fmt16(base)}</span>
            <span className="opacity-70">to</span>
            <span className="text-gero">{fmt16(u16(base + length - 1))}</span>
            <ButtonGroup className="inline-flex rounded-md border border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onJump(u16(base - 256))}
              >
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onJump(u16(base + 256))}
              >
                <ChevronRightIcon />
              </Button>
            </ButtonGroup>
          </div>
        </div>
      }
    >
      <div>
        {(rows.length > 0
          ? rows
          : Array.from({ length: Math.ceil(length / 16) }, (_, k) => ({
              addr: u16(base + k * 16),
              bytes: Array.from({ length: 16 }, () => 0),
            }))
        ).map((r) => (
          <div
            key={r.addr}
            className="grid grid-cols-[5rem_1fr] py-1 border-b border-zinc-900 text-sm"
          >
            <div className="opacity-60">{fmt16(r.addr)}</div>
            <div className="flex gap-3">
              <div className="grid grid-cols-16 gap-1">
                {r.bytes.map((b, i) => {
                  const a = u16(r.addr + i)
                  const oob =
                    rows.length > 0 && memSize ? r.addr + i >= memSize : false
                  const display =
                    rows.length > 0 && !oob ? fmt8(b, true) : '__'
                  return (
                    <span
                      key={`hex-${String(a)}`}
                      className={cn(
                        'shrink-0 w-6 inline-block text-center font-mono',
                        oob || rows.length === 0 ? 'text-muted' : '',
                        isHighlight(a) ? 'bg-gero/50 rounded' : ''
                      )}
                    >
                      {display}
                    </span>
                  )
                })}
              </div>
              <Separator orientation="vertical" />
              <div className="flex gap-0.5">
                {r.bytes.map((b, i) => {
                  const oob =
                    rows.length > 0 && memSize ? r.addr + i >= memSize : false
                  if (oob || rows.length === 0) {
                    return (
                      <span key={`b-${String(r.addr + i)}`} className="shrink-0 text-center text-muted">
                        .
                      </span>
                    )
                  }
                  const c = isAscii(b) ? String.fromCharCode(b) : '.'
                  return (
                    <span
                      key={`b-${String(r.addr + i)}`}
                      className={cn(
                        'shrink-0 text-center',
                        isAscii(b) ? 'text-foreground' : 'text-foreground/50'
                      )}
                    >
                      {c}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
