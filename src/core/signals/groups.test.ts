import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { trajectoryOverlap } from './trajectory-overlap.ts'
import { checkpointSplitMatch } from './checkpoint-split-match.ts'
import { buildGroups } from './groups.ts'
import { analyzeFile, analyzeFiles } from './index.ts'
import { buildContext } from './context.ts'
import { fakeCtx, fakeSamples } from './test-util.ts'
import { parseGbx } from '../parse.ts'
import type { Inflate } from '../model.ts'
import { loadFixture } from '../../test/fixtures.ts'

const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

const straightLine = (n: number, offset = 0): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => [i * 0.2 + offset, 10, 5])

describe('trajectory_overlap', () => {
  test('identical sample series overlap for the full length minus the start skip', () => {
    const a = fakeCtx({ name: 'a', samples: fakeSamples(straightLine(500)) })
    const b = fakeCtx({ name: 'b', samples: fakeSamples(straightLine(500)) })
    const r = trajectoryOverlap(a, b)
    expect(r.level).toBe('relative')
    expect(r.applicable).toBe(true)
    expect(r.value).toBe(4000)
    expect(r.fired).toBe(true)
  })

  test('series offset by half a meter never overlap', () => {
    const a = fakeCtx({ name: 'a', samples: fakeSamples(straightLine(500)) })
    const b = fakeCtx({ name: 'b', samples: fakeSamples(straightLine(500, 0.5)) })
    const r = trajectoryOverlap(a, b)
    expect(r.value).toBe(0)
    expect(r.fired).toBe(false)
  })

  test('a short shared stretch below the window does not fire', () => {
    const shared = straightLine(150)
    const a = fakeCtx({ name: 'a', samples: fakeSamples([...straightLine(200, 50), ...shared]) })
    const b = fakeCtx({ name: 'b', samples: fakeSamples([...straightLine(200, 90), ...shared]) })
    const r = trajectoryOverlap(a, b)
    expect(r.value).toBe(1500)
    expect(r.fired).toBe(false)
  })

  test('not applicable without samples on both sides', () => {
    const a = fakeCtx({ name: 'a', samples: fakeSamples(straightLine(500)) })
    expect(trajectoryOverlap(a, fakeCtx({ name: 'b' })).applicable).toBe(false)
  })

  test('slidrz paired with itself fires', async () => {
    const ctx = await buildContext('slidrz', parseGbx(loadFixture('slidrz')), nodeInflate)
    const copy = { ...ctx, name: 'slidrz-copy', ghost: { ...ctx.ghost, ghostUid: 'other' } }
    const r = trajectoryOverlap(ctx, copy)
    expect(r.fired).toBe(true)
    expect(r.value).toBeGreaterThan(20000)
  })
})

describe('checkpoint_split_match', () => {
  test('counts identical checkpoint times by index', () => {
    const a = fakeCtx({
      ghost: {
        checkpoints: [
          { timeMs: 1000, stuntsScore: null },
          { timeMs: 2500, stuntsScore: null },
          { timeMs: 4000, stuntsScore: null },
        ],
      },
    })
    const b = fakeCtx({
      ghost: {
        checkpoints: [
          { timeMs: 1000, stuntsScore: null },
          { timeMs: 2600, stuntsScore: null },
          { timeMs: 4000, stuntsScore: null },
        ],
      },
    })
    const r = checkpointSplitMatch(a, b)
    expect(r.level).toBe('info')
    expect(r.value).toBe(2)
    expect(r.fired).toBe(false)
    expect(r.evidence.join(' ')).toContain('1000')
    expect(r.evidence.join(' ')).toContain('4000')
  })
})

describe('buildGroups', () => {
  const wall = (sec: number) => ({ startUnixSec: 0, endUnixSec: sec, source: '02C' as const })

  test('different logins on the same map get trajectory but not checkpoint pairing', () => {
    const a = fakeCtx({
      name: 'a',
      samples: fakeSamples(straightLine(500)),
      ghost: { login: 'p1', mapUid: 'm' },
    })
    const b = fakeCtx({
      name: 'b',
      samples: fakeSamples(straightLine(500)),
      ghost: { login: 'p2', mapUid: 'm' },
    })
    const groups = buildGroups([a, b], [analyzeFile(a, null), analyzeFile(b, null)])
    expect(groups.byMap).toHaveLength(1)
    expect(groups.byMap[0]!.files).toEqual(['a', 'b'])
    expect(groups.byMap[0]!.signals.map((s) => s.id)).toEqual(['trajectory_overlap'])
    expect(groups.byMap[0]!.signals[0]!.pair).toEqual(['a', 'b'])
    expect(groups.byLogin).toEqual([])
  })

  test('same login on the same map gets both pair signals', () => {
    const a = fakeCtx({
      name: 'a',
      samples: fakeSamples(straightLine(500)),
      ghost: { login: 'p1', mapUid: 'm' },
    })
    const b = fakeCtx({
      name: 'b',
      samples: fakeSamples(straightLine(500)),
      ghost: { login: 'p1', mapUid: 'm' },
    })
    const groups = buildGroups([a, b], [analyzeFile(a, null), analyzeFile(b, null)])
    expect(groups.byMap[0]!.signals.map((s) => s.id)).toEqual([
      'trajectory_overlap',
      'checkpoint_split_match',
    ])
  })

  test('byLogin aggregates wall time ratio across two files', () => {
    const a = fakeCtx({
      name: 'a',
      ghost: { login: 'p1', mapUid: 'm1', raceTimeMs: 25000, wallTime: wall(30) },
    })
    const b = fakeCtx({
      name: 'b',
      ghost: { login: 'p1', mapUid: 'm2', raceTimeMs: 25000, wallTime: wall(25) },
    })
    const groups = buildGroups([a, b], [analyzeFile(a, null), analyzeFile(b, null)])
    expect(groups.byMap).toEqual([])
    expect(groups.byLogin).toHaveLength(1)
    const w = groups.byLogin[0]!.wallTimeRatio!
    expect(w.n).toBe(2)
    expect(w.mean).toBeCloseTo(1.1)
    expect(w.min).toBeCloseTo(1.0)
    expect(w.max).toBeCloseTo(1.2)
  })

  test('analyzeFiles fills the groups', () => {
    const a = fakeCtx({ name: 'a', ghost: { login: 'p1', mapUid: 'm1', wallTime: wall(26) } })
    const b = fakeCtx({ name: 'b', ghost: { login: 'p1', mapUid: 'm2', wallTime: wall(27) } })
    const report = analyzeFiles([a, b], null)
    expect(report.groups.byLogin[0]!.login).toBe('p1')
  })
})
