import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { trajectoryOverlap } from './trajectory-overlap.ts'
import { checkpointSplitMatch } from './checkpoint-split-match.ts'
import { splitCopy } from './split-copy.ts'
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
    const a = fakeCtx({ name: 'a', samples: fakeSamples(straightLine(1000)) })
    const b = fakeCtx({ name: 'b', samples: fakeSamples(straightLine(1000)) })
    const r = trajectoryOverlap(a, b)
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.value).toBe(6000)
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
    const a = fakeCtx({ name: 'a', samples: fakeSamples([...straightLine(450, 50), ...shared]) })
    const b = fakeCtx({ name: 'b', samples: fakeSamples([...straightLine(450, 90), ...shared]) })
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
    const copy = {
      ...ctx,
      name: 'slidrz-copy',
      ghost: { ...ctx.ghost, ghostUid: 'other', recordingId: null },
    }
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

  test('different logins on the same map get trajectory and split copy pairing', () => {
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
    expect(groups.byMap[0]!.signals.map((s) => s.id)).toEqual(['trajectory_overlap', 'split_copy'])
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

describe('split_copy', () => {
  const cp = (...times: number[]) => times.map((timeMs) => ({ timeMs, stuntsScore: 0 }))

  test('four identical splits across logins fire', () => {
    const a = fakeCtx({
      name: 'a',
      ghost: { login: 'x', checkpoints: cp(5000, 9000, 14000, 20000, 25000) },
    })
    const b = fakeCtx({
      name: 'b',
      ghost: { login: 'y', checkpoints: cp(5000, 9000, 14000, 20000, 25500) },
    })
    const r = splitCopy(a, b)
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.value).toBe(4)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('cp1 5000 ms')
  })

  test('three identical splits do not fire', () => {
    const a = fakeCtx({
      name: 'a',
      ghost: { login: 'x', checkpoints: cp(5000, 9000, 14000, 20000) },
    })
    const b = fakeCtx({
      name: 'b',
      ghost: { login: 'y', checkpoints: cp(5000, 9000, 14000, 20500) },
    })
    const r = splitCopy(a, b)
    expect(r.value).toBe(3)
    expect(r.fired).toBe(false)
  })

  test('not applicable without checkpoints on both sides', () => {
    const a = fakeCtx({ name: 'a', ghost: { login: 'x', checkpoints: [] } })
    const b = fakeCtx({ name: 'b', ghost: { login: 'y' } })
    expect(splitCopy(a, b).applicable).toBe(false)
  })

  test('buildGroups pairs different logins with split_copy and same logins with split match', () => {
    const a = fakeCtx({ name: 'a', ghost: { login: 'x', checkpoints: cp(5000, 9000) } })
    const b = fakeCtx({ name: 'b', ghost: { login: 'y', checkpoints: cp(5000, 9000) } })
    const c = fakeCtx({ name: 'c', ghost: { login: 'x', checkpoints: cp(5000, 9000) } })
    const groups = buildGroups(
      [a, b, c],
      [analyzeFile(a, null), analyzeFile(b, null), analyzeFile(c, null)],
    )
    const ids = (pair: [string, string]) =>
      groups.byMap[0]!.signals.filter((s) => s.pair[0] === pair[0] && s.pair[1] === pair[1]).map(
        (s) => s.id,
      )
    expect(ids(['a', 'b'])).toEqual(['trajectory_overlap', 'split_copy'])
    expect(ids(['a', 'c'])).toEqual(['trajectory_overlap', 'checkpoint_split_match'])
  })

  test('a downloaded record with the login edited is a copy', async () => {
    const ctx = await buildContext('slidrz', parseGbx(loadFixture('slidrz')), nodeInflate)
    const thief = { ...ctx, name: 'thief', ghost: { ...ctx.ghost, login: 'thief' } }
    const report = analyzeFiles([ctx, thief], null)
    const copy = report.groups.byMap[0]!.signals.find((s) => s.id === 'split_copy')!
    expect(copy.fired).toBe(true)
    expect(copy.evidence.join(' ')).toContain('across logins')
  })

  test('single-file reports carry a split_copy placeholder', () => {
    const s = analyzeFile(fakeCtx(), null).signals.find((x) => x.id === 'split_copy')!
    expect(s.applicable).toBe(false)
  })
})

describe('trajectory_overlap, time shift', () => {
  // 50 ms samples along x at 10 m/s over 20 s, b runs the same line delayed by 300 ms
  const line50 = (n: number, delayMs: number) =>
    Array.from({ length: n }, (_, i) => ({
      timeMs: i * 50,
      position: [Math.max(0, i * 50 - delayMs) / 100, 10, 5] as [number, number, number],
      speedMs: 10,
      simCoef: 1,
      state: null,
      steer: 0,
      gas: true,
      brake: false,
    }))

  test('the same line driven 300 ms later overlaps at shift 300 ms', () => {
    const a = fakeCtx({ name: 'a', samples: line50(400, 0) })
    const b = fakeCtx({ name: 'b', samples: line50(400, 300) })
    const r = trajectoryOverlap(a, b)
    expect(r.fired).toBe(true)
    expect(r.value).toBeGreaterThan(10000)
    expect(r.evidence[0]).toContain('shift 300 ms')
  })

  test('a line 0.5 m to the side never overlaps at any shift', () => {
    const a = fakeCtx({ name: 'a', samples: line50(400, 0) })
    const b = fakeCtx({
      name: 'b',
      samples: line50(400, 0).map((s) => ({ ...s, position: [s.position[0], 10.5, 5] })),
    })
    expect(trajectoryOverlap(a, b).fired).toBe(false)
  })
})
