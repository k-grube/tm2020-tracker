import { REPEAT_MIN_DISTINCT_VALUES, REPEAT_MIN_LEN_TICKS, TICK_MS } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector, SignalResult } from './types.ts'

const BASE = 31

interface Repeat {
  length: number
  first: number
  second: number
  distinct: number
}

function distinctIn(steer: Int8Array, start: number, length: number): number {
  const seen = new Set<number>()
  for (let i = start; i < start + length; i++) {
    seen.add(steer[i]!)
  }
  return seen.size
}

function sameWindow(steer: Int8Array, a: number, b: number, length: number): boolean {
  for (let i = 0; i < length; i++) {
    if (steer[a + i] !== steer[b + i]) {
      return false
    }
  }
  return true
}

// first non-overlapping pair of identical windows of the given length, rolling hash then direct compare
function findRepeat(steer: Int8Array, length: number): Repeat | null {
  const n = steer.length
  if (length > n / 2) {
    return null
  }
  let pow = 1
  for (let i = 1; i < length; i++) {
    pow = Math.imul(pow, BASE)
  }
  const starts = new Map<number, number[]>()
  let h = 0
  for (let i = 0; i < n; i++) {
    if (i >= length) {
      h = (h - Math.imul(steer[i - length]! + 128, pow)) | 0
    }
    h = (Math.imul(h, BASE) + steer[i]! + 128) | 0
    if (i < length - 1) {
      continue
    }
    const start = i - length + 1
    const list = starts.get(h)
    if (list) {
      for (const first of list) {
        if (start >= first + length && sameWindow(steer, first, start, length)) {
          const distinct = distinctIn(steer, first, length)
          if (distinct >= REPEAT_MIN_DISTINCT_VALUES) {
            return { length, first, second: start, distinct }
          }
        }
      }
      list.push(start)
    } else {
      starts.set(h, [start])
    }
  }
  return null
}

// pad only: longest stretch of analog steering that appears twice, byte for byte
export const steerRepetition: Detector = (ctx) => {
  if (ctx.device !== 'pad' || !ctx.steer) {
    return notApplicable('steer_repetition', 'empirical', `device ${ctx.device}, pad only`)
  }
  const steer = ctx.steer
  let best: Repeat | null = findRepeat(steer, REPEAT_MIN_LEN_TICKS)
  if (best) {
    // a repeat of length L implies one of every shorter length, so binary search the longest
    let lo = REPEAT_MIN_LEN_TICKS
    let hi = Math.floor(steer.length / 2)
    while (lo < hi) {
      const mid = Math.ceil((lo + hi + 1) / 2)
      const found = findRepeat(steer, mid)
      if (found) {
        best = found
        lo = mid
      } else {
        hi = mid - 1
      }
    }
  }
  const evidence = best
    ? [
        `${best.length} ticks (${best.length * TICK_MS} ms) repeated at ${best.first * TICK_MS} ms and ${best.second * TICK_MS} ms, ${best.distinct} distinct values`,
      ]
    : [`no exact repeat of ${REPEAT_MIN_LEN_TICKS} ticks or more`]
  const result: SignalResult = {
    id: 'steer_repetition',
    level: 'empirical',
    applicable: true,
    fired: best !== null,
    value: best?.length ?? 0,
    unit: 'ticks',
    evidence,
    references: [],
  }
  if (!best) {
    return result
  }
  const label = `repeat ${best.length} ticks`
  return {
    ...result,
    spans: [
      { startTick: best.first, endTick: best.first + best.length, label },
      { startTick: best.second, endTick: best.second + best.length, label },
    ],
  }
}
