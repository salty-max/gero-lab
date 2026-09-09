import type { Ev, Fault, Snapshot } from '@/lib/protocol'
import { fmt16 } from '@/lib/format'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type LogKind = Ev['t'] | 'info' | 'fault'
type BaseEntry<K extends LogKind, D = undefined> = {
  id: number
  t: number // epoch ms
  kind: K
  summary: string
} & (D extends undefined ? { details?: undefined } : { details: D })

export type LogEntry =
  | BaseEntry<'ready'>
  | BaseEntry<'info'>
  | BaseEntry<'snapshot', Snapshot>
  | BaseEntry<
      'paused',
      { reason: 'breakpoint' | 'manual' | 'halt'; ip: number }
    >
  | BaseEntry<'fault', Fault>
  | BaseEntry<'irq'>
  | BaseEntry<'im'>
  | BaseEntry<'bp'>
  | BaseEntry<'run'>
  | BaseEntry<'load', { size: number; start: number; entry: number }>
  | BaseEntry<'mem', { addr: number; len: number }>
  | BaseEntry<'poke', { addr: number; len: number }>
  | BaseEntry<'tick'>
  | BaseEntry<'output', { text: string }>
  | BaseEntry<'error', { msg: string }>
  | BaseEntry<
      'diagnostic',
      {
        severity: 'error' | 'warning' | 'note'
        code?: string
        where: string
        message: string
        note?: string
      }
    >

const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n) + '...' : s)

/**
 * What ends a run of program output.
 *
 * Only a change in the program's flow does. The snapshots, ticks and
 * memory reads a running cockpit produces between two printed
 * characters are not something the reader is meant to see the output
 * broken around.
 */
const CLOSES_OUTPUT = new Set<LogKind>([
  'diagnostic',
  'ready',
  'run',
  'load',
  'paused',
  'fault',
  'error',
  'info',
])

/** Program output on one line: newlines are what the program printed,
 *  not row breaks in the log. */
const printable = (s: string) => s.replace(/\n/g, '⏎').replace(/⏎$/, '')

export type UseVmLogOpts = {
  max?: number
  includeTick?: boolean
  tickSample?: number // keep every nth tick
}

type Filters = Record<LogKind, boolean>

const FILTERS_STORAGE_KEY = 'gero:logFilters:v1'

const defaultFilters: Filters = {
  ready: true,
  info: true,
  snapshot: false,
  paused: true,
  fault: true,
  mem: false,
  poke: true,
  tick: false,
  irq: true,
  im: true,
  bp: true,
  run: true,
  load: true,
  output: true,
  error: true,
  diagnostic: true,
}

export function useVMLog(
  on: <T extends Ev['t']>(
    t: T,
    fn: (ev: Extract<Ev, { t: T }>) => void
  ) => () => void,
  {
    max = 500,
    includeTick = false,
    tickSample = 32,
  }: UseVmLogOpts = {},
  alreadyReady?: boolean
) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filters, setFilters] = useState<Record<LogEntry['kind'], boolean>>(
    () => {
      try {
        if (typeof window === 'undefined') return defaultFilters
        const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
        if (!raw) return defaultFilters
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (!parsed || typeof parsed !== 'object') return defaultFilters
        const next = { ...defaultFilters }
        for (const k of Object.keys(defaultFilters)) {
          const v = parsed[k]
          if (typeof v === 'boolean') next[k as LogEntry['kind']] = v
        }
        return next
      } catch {
        return defaultFilters
      }
    }
  )
  const counter = useRef(0)
  /** The output entry still being written to, if one is open. */
  const openOutput = useRef<number | null>(null)
  const tickCount = useRef(0)
  const seenReady = useRef(false)

  const push = useCallback(
    (e: LogEntry) => {
      if (CLOSES_OUTPUT.has(e.kind)) openOutput.current = null
      setEntries((prev) => {
        const next = [...prev, e]
        if (next.length > max) next.splice(0, next.length - max)
        return next
      })
    },
    [max]
  )

  useEffect(() => {
    const unsub: Array<() => void> = []

    unsub.push(
      on('ready', () => {
        if (seenReady.current) return
        seenReady.current = true
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'ready',
          summary: 'worker ready',
        })
      })
    )

    unsub.push(
      on('snapshot', (e) => {
        const s = e.snap
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'snapshot',
          summary: 'snapshot',
          details: s,
        })
      })
    )

    unsub.push(
      on('paused', (e) => {
        if (e.reason === 'fault') {
          const f = e.fault
          push({
            id: ++counter.current,
            t: Date.now(),
            kind: 'fault',
            summary: 'paused: fault',
            details: { msg: f?.msg ?? '', code: f?.code, meta: f?.meta },
          })
          return
        }

        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'paused',
          summary: 'paused',
          details: { reason: e.reason, ip: e.ip },
        })
      })
    )

    // Interrupt lifecycle
    unsub.push(
      on('irq', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'irq',
          summary: `irq ${fmt16(e.vector)} @ ip=${fmt16(e.ip)}`,
        })
      })
    )

    // Interrupt mask changes
    unsub.push(
      on('im', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'im',
          summary: `im ${fmt16(e.from)}→${fmt16(e.to)}`,
        })
      })
    )

    if (includeTick) {
      unsub.push(
        on('tick', (e) => {
          const n = ++tickCount.current
          if (n % tickSample !== 0) return
          push({
            id: ++counter.current,
            t: Date.now(),
            kind: 'tick',
            summary: `tick ip=${fmt16(e.ip)}`,
          })
        })
      )
    }


    // What the program printed, and what a command refused. Two
    // different things, and telling them apart is the point of the
    // console — a program printing `[error]` is program output.
    // A program prints a character at a time, and at one instruction
    // per slice that is one event each. They join onto the entry
    // already open, the way a terminal does — otherwise a line of
    // output is a dozen rows and its newline is an empty one.
    unsub.push(
      on('output', (e) => {
        const openId = openOutput.current
        if (openId === null) {
          // Allocated outside the updater: React may call an updater
          // more than once, and an id minted inside one drifts.
          const id = ++counter.current
          openOutput.current = id
          push({
            id,
            t: Date.now(),
            kind: 'output',
            summary: short(printable(e.text)),
            details: { text: e.text },
          })
          return
        }
        setEntries((prev) =>
          prev.map((entry) => {
            if (entry.id !== openId || entry.kind !== 'output') return entry
            const text = entry.details.text + e.text
            return {
              ...entry,
              t: Date.now(),
              summary: short(printable(text)),
              details: { text },
            }
          })
        )
      })
    )

    unsub.push(
      on('error', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'error',
          summary: short(e.msg),
          details: { msg: e.msg },
        })
      })
    )

    // What a build reported, in the CLI's own words.
    unsub.push(
      on('diagnostic', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'diagnostic',
          summary: short(`${e.code ? e.code + ': ' : ''}${e.message}`),
          details: {
            severity: e.severity,
            ...(e.code === undefined ? {} : { code: e.code }),
            where: `${e.file}:${String(e.line)}:${String(e.column)}`,
            message: e.message,
            ...(e.note === undefined ? {} : { note: e.note }),
          },
        })
      })
    )

    unsub.push(
      on('mem', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'mem',
          summary: 'mem',
          details: { addr: e.addr, len: e.data.byteLength },
        })
      })
    )

    unsub.push(
      on('poke', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'poke',
          summary: 'poke',
          details: { addr: e.addr, len: e.len },
        })
      })
    )

    // Run started
    unsub.push(
      on('run', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'run',
          summary: `starting @ ip=${fmt16(e.ip)}`,
        })
      })
    )

    // Program loaded
    unsub.push(
      on('load', (e) => {
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'load',
          summary: 'load',
          details: { size: e.size, start: e.start, entry: e.entry },
        })
      })
    )

    // Breakpoints changed
    unsub.push(
      on('bp', (e) => {
        const add = e.add.map((a) => fmt16(a)).join(', ')
        const rem = e.remove.map((a) => fmt16(a)).join(', ')
        const parts = [] as string[]
        if (e.add.length) parts.push(`+${e.add.length} [${add}]`)
        if (e.remove.length) parts.push(`-${e.remove.length} [${rem}]`)
        push({
          id: ++counter.current,
          t: Date.now(),
          kind: 'bp',
          summary: `bp ${parts.join(' ')} total=${e.total}`,
        })
      })
    )

    return () => {
      unsub.forEach((u) => u())
    }
  }, [on, includeTick, tickSample, push, max])

  // If the VM is already ready (e.g., due to effect ordering or HMR),
  // emit a single ready entry on mount.
  useEffect(() => {
    if (!alreadyReady || seenReady.current) return
    seenReady.current = true
    push({
      id: ++counter.current,
      t: Date.now(),
      kind: 'info',
      summary: 'worker ready',
    })
  }, [alreadyReady, push])

  const clear = useCallback(() => setEntries([]), [])
  const copytoClipboard = useCallback(async () => {
    const detailsText = (e: LogEntry): string => {
      switch (e.kind) {
        case 'snapshot':
          return `ip=${fmt16(e.details.ip)} sp=${fmt16(e.details.sp)} fp=${fmt16(e.details.fp)}`
        case 'fault': {
          const { code, msg, meta } = e.details
          const parts: string[] = []
          if (code) parts.push(`code=${code}`)
          if (msg) parts.push(`msg=${msg}`)
          const mkeys = meta ? Object.keys(meta) : []
          if (mkeys.length)
            parts.push(
              `meta=[${mkeys.slice(0, 3).join(', ')}${mkeys.length > 3 ? ', …' : ''}]`
            )
          return parts.join(' ')
        }
        case 'paused': {
          const { reason, ip } = e.details
          return `reason=${reason} ip=${fmt16(ip)}`
        }
        case 'load':
          return `size=${e.details.size} start=${fmt16(e.details.start)} entry=${fmt16(e.details.entry)}`
        case 'mem': {
          const { addr, len } = e.details
          return `addr=${fmt16(addr)} len=${len}`
        }
        case 'poke': {
          const { addr, len } = e.details
          return `addr=${fmt16(addr)} len=${len}`
        }
        default:
          return ''
      }
    }
    const lines = entries.map((e) => {
      const ts = new Date(e.t).toISOString().split('T')[1]!.replace('Z', '')
      const d = detailsText(e)
      return `[${ts}] ${e.kind.padEnd(9)} ${e.summary}${d ? ` :: ${short(d, 500)}` : ''}`
    })

    await navigator.clipboard.writeText(lines.join('\n'))
  }, [entries])
  const filteredEntries = useMemo(
    () => entries.filter((e) => filters[e.kind] ?? true),
    [entries, filters]
  )

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
    } catch {
      // ignore
    }
  }, [filters])

  return {
    entries,
    filteredEntries,
    filters,
    setFilters,
    clear,
    copytoClipboard,
  }
}
