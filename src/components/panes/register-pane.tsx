import { fmt16 } from '@/lib/format'
import type { RegName } from '@/lib/protocol'
import { useMemo, useState, useEffect, useRef } from 'react'
import { SectionCard } from '../section-card'

type RegistersPaneProps = {
  regs: Record<RegName, number> | null
  onEdit: (name: RegName, value: number) => void
}

export function RegistersPane({ regs, onEdit }: RegistersPaneProps) {
  const names = useMemo(
    () => (regs ? (Object.keys(regs) as RegName[]) : []),
    [regs]
  )

  return (
    <SectionCard
      title="Registers"
      info="CPU registers. Double-click a value to edit; changes apply immediately."
    >
      {regs ? (
        <div className="grid grid-cols-4 gap-2 p-3 text-sm">
          {names.map((n) => (
            <RegCell key={n} name={n} value={regs[n]!} onEdit={onEdit} />
          ))}
        </div>
      ) : (
        <div className="flex w-full h-full items-center justify-center text-sm opacity-60">
          No snapshot yet
        </div>
      )}
    </SectionCard>
  )
}

type RegCellProps = {
  name: RegName
  value: number
  onEdit: (name: RegName, value: number) => void
}

function RegCell({ name, value, onEdit }: RegCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fmt16(value))
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Track previous value to detect changes
  const prevValueRef = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setFlash(true)
      prevValueRef.current = value
      const to = setTimeout(() => setFlash(false), 300)
      return () => clearTimeout(to)
    }
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select?.()
    }
  }, [editing])

  return (
    <div
      className={`border border-zinc-800 rounded px-2 py-1 transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-2 ${flash ? 'bg-gero/50' : ''}`}
    >
      <div className="text-xs opacity-60">{name}</div>
      {!editing ? (
        <button
          type="button"
          className="w-full text-left"
          onClick={() => {
            setDraft(fmt16(value))
            setEditing(true)
          }}
        >
          {fmt16(value)}
        </button>
      ) : (
        <input
          ref={inputRef}
          className="bg-transparent outline-none w-full"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = parseInt(draft.replace(/^0x/i, ''), 16)
              if (!Number.isNaN(v)) onEdit(name, v & 0xffff)
              setEditing(false)
            } else if (e.key === 'Escape') {
              setEditing(false)
            }
          }}
        />
      )}
    </div>
  )
}
