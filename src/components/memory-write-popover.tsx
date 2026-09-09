import { useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'
import { IconButton } from './ui/icon-button'
import { HexInput } from './ui/hex-input'
import { MemoryStickIcon, PlusIcon } from 'lucide-react'
import { useVM } from '@/contexts/vm-context'
import { u16, u8 } from '@/lib/format'

type Entry = { id: number; addrHex: string; values: string }

function parseValuesToBytes(values: string): Uint8Array | null {
  const raw = values.trim()
  if (!raw) return new Uint8Array(0)
  const tokens = raw
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)

  // Decide per entry: byte or word based on any token > 0xFF or >2 hex digits
  let asWord = false
  const nums: number[] = []
  for (const t of tokens) {
    const tt = t.startsWith('0x') || t.startsWith('0X') ? t.slice(2) : t
    if (!/^[0-9a-fA-F]+$/.test(tt)) return null
    const n = parseInt(tt, 16) >>> 0
    nums.push(n)
    if (tt.length > 2 || n > 0xff) asWord = true
  }

  if (!asWord) {
    return new Uint8Array(nums.map((n) => u8(n)))
  }

  // Treat as 16-bit words, big-endian (high then low)
  const out = new Uint8Array(nums.length * 2)
  nums.forEach((n, i) => {
    out[i * 2] = (n >>> 8) & 0xff
    out[i * 2 + 1] = n & 0xff
  })
  return out
}

export function MemoryWritePopover() {
  const vm = useVM()
  const [open, setOpen] = useState(false)
  const nextId = useRef(1)
  const [entries, setEntries] = useState<Entry[]>([
    { id: 0, addrHex: '0000', values: '' },
  ])
  const [error, setError] = useState<string | null>(null)

  const addRow = () =>
    setEntries((e) => [...e, { id: nextId.current++, addrHex: '0000', values: '' }])
  const clear = () => {
    setEntries([{ id: nextId.current++, addrHex: '0000', values: '' }])
    setError(null)
  }
  const submit = () => {
    setError(null)
    try {
      const segs: Array<{ addr: number; data: Uint8Array }> = []
      for (const { addrHex, values } of entries) {
        const base = parseInt(addrHex || '0', 16)
        if (!Number.isFinite(base)) throw new Error('Invalid address')
        const bytes = parseValuesToBytes(values)
        if (bytes == null)
          throw new Error('Invalid values; use hex, space/comma separated')
        if (bytes.length === 0) continue
        segs.push({ addr: u16(base), data: bytes })
      }
      if (segs.length === 0) {
        setOpen(false)
        return
      }
      if (segs.length === 1) vm.poke(segs[0]!.addr, segs[0]!.data)
      else vm.pokeMany(segs)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid input')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline">
          <MemoryStickIcon />
          Write Memory
        </Button>} />
      <PopoverContent className="w-[420px]">
        <div className="flex flex-col gap-3">
          {entries.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-2">
              <input
                aria-label={`Values ${idx + 1}`}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring focus:ring-offset-2"
                placeholder="hex values (e.g. DE AD BE EF or 1234 00FF)"
                value={row.values}
                onChange={(e) =>
                  setEntries((list) => {
                    const next = list.slice()
                    next[idx] = { ...next[idx]!, values: e.target.value }
                    return next
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit()
                }}
              />
              <span className="opacity-60 text-sm">@</span>
              <HexInput
                aria-label={`Address ${idx + 1}`}
                value={row.addrHex}
                onChange={(e) =>
                  setEntries((list) => {
                    const next = list.slice()
                    next[idx] = {
                      ...next[idx]!,
                      addrHex: e.currentTarget.value,
                    }
                    return next
                  })
                }
              />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <IconButton
              label="Add row"
              icon={PlusIcon}
              variant="outline"
              onClick={addRow}
            />
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={clear}>
                Clear
              </Button>
              <Button onClick={submit}>Apply</Button>
            </div>
          </div>
          {error && <div className="text-destructive text-xs">{error}</div>}
          <div className="text-xs opacity-70">
            Tip: Enter hex tokens separated by spaces or commas. If any token
            exceeds 0xFF (or has more than two hex digits), values are written
            as 16-bit words (big-endian). Otherwise, values are written as
            bytes.
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
