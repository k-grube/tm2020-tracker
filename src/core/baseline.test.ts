import { describe, expect, test } from 'vitest'
import { computeBaseline, quantile } from './baseline.ts'
import { analyzeFile } from './signals/index.ts'
import { fakeBaseline, fakeCtx } from './signals/test-util.ts'
import type { Device, FileReport } from './signals/types.ts'

function reportWith(device: Device, wallDelta: number, name = 'f'): FileReport {
  return {
    name,
    login: 'p',
    mapUid: 'm',
    raceTimeMs: 25000,
    device,
    signals: [
      {
        id: 'wall_time_delta',
        level: 'relative',
        applicable: true,
        fired: false,
        value: wallDelta,
        unit: 's',
        evidence: [],
        references: [],
      },
      {
        id: 'wall_time_ratio',
        level: 'info',
        applicable: true,
        fired: false,
        value: 1 + wallDelta / 25,
        unit: 'ratio',
        evidence: [],
        references: [],
      },
      {
        id: 'steer_repetition',
        level: 'relative',
        applicable: false,
        fired: false,
        value: null,
        unit: '',
        evidence: [],
        references: [],
      },
    ],
    summary: { absoluteFired: [], relativeOutside: [], needsHumanReview: false },
  }
}

describe('quantile', () => {
  test('interpolates between sorted values', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2)
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4)
    expect(quantile([7], 0.9)).toBe(7)
  })
})

describe('computeBaseline', () => {
  test('groups by device and omits devices with fewer than five files', () => {
    const reports = [
      ...[1.0, 1.1, 1.2, 1.3, 1.4, 6.0].map((v, i) => reportWith('pad', v, `pad${i}`)),
      ...[1.0, 2.0, 3.0].map((v, i) => reportWith('keyboard', v, `kb${i}`)),
    ]
    const b = computeBaseline(reports, { ranks: [10, 50], chunkPresence: { '0x0309202c': 1 } })
    expect(b.files).toBe(9)
    expect(b.ranks).toEqual([10, 50])
    expect(b.chunkPresence['0x0309202c']).toBe(1)
    const pad = b.signals.wall_time_delta!.pad!
    expect(pad.n).toBe(6)
    expect(pad.median).toBeCloseTo(1.25)
    expect(pad.q1).toBeCloseTo(1.125)
    expect(pad.q3).toBeCloseTo(1.375)
    expect(b.signals.wall_time_delta!.keyboard).toBeUndefined()
    expect(b.signals.wall_time_ratio).toBeUndefined()
    expect(b.signals.steer_repetition).toBeUndefined()
    expect(typeof b.builtAt).toBe('string')
  })
})

describe('analyzeFile with a baseline', () => {
  test('attaches the baseline reference and fires outside the fence', () => {
    const ctx = fakeCtx({
      device: 'pad',
      ghost: { raceTimeMs: 25000, wallTime: { startUnixSec: 0, endUnixSec: 40, source: '02C' } },
    })
    const baseline = fakeBaseline('wall_time_delta', 'pad', { median: 1.5, q1: 1.1, q3: 1.8 })
    const r = analyzeFile(ctx, baseline).signals.find((s) => s.id === 'wall_time_delta')!
    expect(r.value).toBe(15)
    expect(r.fired).toBe(true)
    expect(r.references.some((x) => x.source === 'baseline' && x.label.includes('pad'))).toBe(true)
    expect(analyzeFile(ctx, baseline).summary.relativeOutside).toEqual(['wall_time_delta'])
  })
})
