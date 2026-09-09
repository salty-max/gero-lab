import type { Fault } from './protocol'

type PlainishError = { msg: unknown; code?: unknown; meta?: unknown }

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const hasMsg = (v: unknown): v is PlainishError => isRecord(v) && 'msg' in v

export const normalizeMeta = (
  m: unknown
): Record<string, unknown> | undefined => (isRecord(m) ? m : undefined)

export function toError(err: unknown): Fault {
  if (hasMsg(err)) {
    return {
      msg: String(err.msg),
      code: err.code !== undefined ? String(err.code) : undefined,
      meta: normalizeMeta(err.meta),
    }
  }

  if (err instanceof Error) {
    return { msg: err.message }
  }

  return { msg: String(err) }
}

export const withAddrMeta = (f: Fault, addr: number): Fault => ({
  ...f,
  meta: { ...f.meta, addr },
})
