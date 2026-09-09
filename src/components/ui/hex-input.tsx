import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from 'react'

type HexInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  onEnter?: (value: string) => void
}

export function HexInput({ value: v, onEnter, ...props }: HexInputProps) {
  // Number of hex digits to display/pad to (default 4 unless caller overrides maxLength)
  const digits = useMemo(() => {
    const ml = typeof props.maxLength === 'number' ? props.maxLength : 4
    return Math.max(1, ml)
  }, [props.maxLength])

  const normalize = useCallback(
    (val: unknown): string => {
      if (val == null) return ''
      if (typeof val === 'number')
        return (val >>> 0).toString(16).toUpperCase().padStart(digits, '0')
      if (typeof val === 'string') return val.toUpperCase()
      return String(val).toUpperCase()
    },
    [digits]
  )

  const [value, setValue] = useState<string>(normalize(v))

  useEffect(() => {
    if (v !== undefined) setValue(normalize(v))
  }, [v, digits, normalize])

  return (
    <div className="w-[72px] h-[32px] flex items-center gap-1 rounded border border-input bg-background px-2 py-1 text-sm focus-within:outline-none focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
      <span className="opacity-70">0x</span>
      <input
        {...props}
        value={value}
        className="w-full focus:outline-none"
        type="text"
        inputMode="text"
        pattern="^[0-9a-fA-F]+$"
        placeholder={''.padStart(digits, '0')}
        maxLength={digits}
        onChange={(e) => {
          // Accept only hex chars, uppercase them, clamp to digits
          const raw = (e.currentTarget.value || '')
            .toUpperCase()
            .replace(/[^0-9A-F]/g, '')
          const s = raw.slice(0, digits)
          setValue(s)
          props.onChange?.({
            ...e,
            currentTarget: { ...e.currentTarget, value: s },
            target: { ...e.target, value: s },
          } as unknown as ChangeEvent<HTMLInputElement>)
        }}
        onBlur={(e) => {
          const raw = (e.currentTarget.value || '').toUpperCase()
          const n = raw ? parseInt(raw, 16) : 0
          const s = (n >>> 0).toString(16).toUpperCase().padStart(digits, '0')
          setValue(s)
          props.onChange?.({
            ...e,
            currentTarget: { ...e.currentTarget, value: s },
            target: { ...e.target, value: s },
          } as unknown as ChangeEvent<HTMLInputElement>)
          props.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          props.onKeyDown?.(e)
          // Increment on ArrowUp
          if (e.key === 'ArrowUp') {
            const n = parseInt(value || '0', 16) || 0
            const v = (n + 1) & 0xffff
            const s = v.toString(16).toUpperCase().padStart(digits, '0')
            setValue(s)
            props.onChange?.({
              ...e,
              currentTarget: {
                ...e.currentTarget,
                value: s,
              },
              target: {
                ...e.target,
                value: s,
              },
            } as unknown as ChangeEvent<HTMLInputElement>)
          }
          // Decrement on ArrowDown
          if (e.key === 'ArrowDown') {
            const n = parseInt(value || '0', 16) || 0
            const v = (n - 1) & 0xffff
            const s = v.toString(16).toUpperCase().padStart(digits, '0')
            setValue(s)
            props.onChange?.({
              ...e,
              currentTarget: {
                ...e.currentTarget,
                value: s,
              },
              target: {
                ...e.target,
                value: s,
              },
            } as unknown as ChangeEvent<HTMLInputElement>)
          }
          if (e.key === 'Enter') {
            const raw = (e.currentTarget.value || '').toUpperCase()
            const n = raw ? parseInt(raw, 16) : 0
            const s = (n >>> 0).toString(16).toUpperCase().padStart(digits, '0')
            setValue(s)
            props.onChange?.({
              ...e,
              currentTarget: { ...e.currentTarget, value: s },
              target: { ...e.target, value: s },
            } as unknown as ChangeEvent<HTMLInputElement>)
            onEnter?.(s)
            try {
              e.currentTarget.blur()
            } catch (e) {
              console.warn(e)
            }
          }
        }}
      />
    </div>
  )
}
