import type { Reference, SignalResult } from '../core/signals/types.ts'

export function fmtMs(ms: number): string {
  const m = Math.floor(ms / 60000)
  const s = ((ms % 60000) / 1000).toFixed(3)
  return m > 0 ? `${m}:${s.padStart(6, '0')}` : s
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(3)
}

export function fmtValue(s: SignalResult): string {
  if (s.value === null) {
    return '-'
  }
  return s.unit ? `${fmtNum(s.value)} ${s.unit}` : fmtNum(s.value)
}

export function fmtRange(r: Reference): string {
  if (r.low !== null && r.high !== null) {
    return `${fmtNum(r.low)} to ${fmtNum(r.high)}`
  }
  if (r.high !== null) {
    return `up to ${fmtNum(r.high)}`
  }
  if (r.low !== null) {
    return `from ${fmtNum(r.low)}`
  }
  return ''
}

export type Status = 'fired' | 'ok' | 'n/a'

export function status(s: SignalResult): Status {
  if (!s.applicable) {
    return 'n/a'
  }
  return s.fired ? 'fired' : 'ok'
}
