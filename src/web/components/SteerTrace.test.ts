import { describe, expect, test } from 'vitest'
import { steerPath } from './SteerTrace.tsx'
import { inputLanes } from './InputTimeline.tsx'
import type { InputEvent } from '../../core/model.ts'

const ev = (tick: number, kind: InputEvent['kind'], value: number, value2?: number): InputEvent =>
  value2 === undefined
    ? { tick, timeMs: tick * 10, kind, value }
    : { tick, timeMs: tick * 10, kind, value, value2 }

describe('steerPath', () => {
  test('emits one M and ticks/10 - 1 L commands', () => {
    const steer = new Int8Array(1000)
    steer.fill(127, 500)
    const d = steerPath(steer, 400, 100)
    expect(d.match(/M/g)).toHaveLength(1)
    expect(d.match(/L/g)).toHaveLength(99)
    expect(d.startsWith('M0,50')).toBe(true)
    expect(d.endsWith(',0')).toBe(true)
  })

  test('is empty for an empty series', () => {
    expect(steerPath(new Int8Array(0), 400, 100)).toBe('')
  })
})

describe('inputLanes', () => {
  test('merges consecutive presses into segments', () => {
    const events: InputEvent[] = [
      ev(0, 'steer', 40),
      ev(3, 'actionSlot', 1, 1),
      ev(5, 'gas', 1),
      ev(8, 'actionSlot', 1, 0),
      ev(12, 'respawn', 1),
      ev(20, 'gas', 0),
      ev(25, 'mouse', 100, 200),
      ev(30, 'gas', 1),
      ev(31, 'brake', 1),
      ev(31, 'brake', 0),
    ]
    expect(inputLanes(events, 50)).toEqual([
      {
        kind: 'gas',
        segments: [
          [5, 20],
          [30, 50],
        ],
      },
      { kind: 'brake', segments: [[31, 32]] },
      { kind: 'actionSlot', segments: [[3, 8]] },
      { kind: 'respawn', segments: [[12, 13]] },
    ])
  })

  test('returns no lanes without binary inputs', () => {
    expect(inputLanes([ev(0, 'steer', 1)], 10)).toEqual([])
  })
})
