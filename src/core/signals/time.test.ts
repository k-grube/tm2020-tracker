import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { wallTimeDelta, wallTimeRatio } from './wall-time.ts'
import { ticksVsRaceTime } from './ticks-vs-racetime.ts'
import { metadata } from './metadata.ts'
import { buildContext } from './context.ts'
import { fakeBaseline, fakeCtx } from './test-util.ts'
import { parseGbx } from '../parse.ts'
import type { Inflate } from '../model.ts'
import { FIXTURES, loadFixture, type FixtureName } from '../../test/fixtures.ts'

const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

describe('wall_time_ratio', () => {
  const ctx = fakeCtx({
    device: 'pad',
    ghost: { raceTimeMs: 25000, wallTime: { startUnixSec: 100, endUnixSec: 130, source: '02C' } },
  })

  test('30 s wall over 25 s race is 1.2, shown as info', () => {
    const r = wallTimeRatio(ctx, null)
    expect(r.id).toBe('wall_time_ratio')
    expect(r.level).toBe('info')
    expect(r.applicable).toBe(true)
    expect(r.value).toBeCloseTo(1.2)
    expect(r.fired).toBe(false)
    expect(r.evidence.join(' ')).toContain('30 s')
    expect(r.references).toEqual([])
  })

  test('never fires, even with a baseline that puts it outside the fence', () => {
    const baseline = fakeBaseline('wall_time_ratio', 'pad', { median: 1.02, q1: 1.0, q3: 1.05 })
    const r = wallTimeRatio(ctx, baseline)
    expect(r.fired).toBe(false)
    expect(r.level).toBe('info')
  })

  test('not applicable without wall time', () => {
    const r = wallTimeRatio(fakeCtx(), null)
    expect(r.applicable).toBe(false)
    expect(r.value).toBeNull()
  })
})

describe('wall_time_delta', () => {
  const ctx = fakeCtx({
    device: 'pad',
    ghost: { raceTimeMs: 25000, wallTime: { startUnixSec: 100, endUnixSec: 130, source: '02C' } },
  })

  test('30 s wall over 25 s race is 5 s and does not fire without a baseline', () => {
    const r = wallTimeDelta(ctx, null)
    expect(r.id).toBe('wall_time_delta')
    expect(r.level).toBe('relative')
    expect(r.value).toBe(5)
    expect(r.unit).toBe('s')
    expect(r.fired).toBe(false)
  })

  test('fires with a baseline when above the fence', () => {
    const baseline = fakeBaseline('wall_time_delta', 'pad', { median: 1.5, q1: 1.1, q3: 1.8 })
    const r = wallTimeDelta(ctx, baseline)
    expect(r.fired).toBe(true)
    expect(r.references[0]).toMatchObject({ source: 'baseline', low: 1.1, high: 1.8 })
  })

  test('does not fire with a baseline when inside the fence', () => {
    const baseline = fakeBaseline('wall_time_delta', 'pad', { median: 5, q1: 4, q3: 6 })
    expect(wallTimeDelta(ctx, baseline).fired).toBe(false)
  })

  test('not applicable without wall time', () => {
    expect(wallTimeDelta(fakeCtx(), null).applicable).toBe(false)
  })
})

describe('ticks_vs_racetime', () => {
  test('inputs ending 5 ticks before the finish fire', () => {
    const r = ticksVsRaceTime(
      fakeCtx({
        ghost: {
          inputs: [{ version: 12, u01: 0, startOffsetMs: 0, ticks: 2495, data: new Uint8Array(0) }],
        },
      }),
      null,
    )
    expect(r.level).toBe('absolute')
    expect(r.value).toBe(-50)
    expect(r.fired).toBe(true)
  })

  test('within 2 ticks does not fire', () => {
    const r = ticksVsRaceTime(
      fakeCtx({
        ghost: {
          inputs: [{ version: 12, u01: 0, startOffsetMs: 0, ticks: 2499, data: new Uint8Array(0) }],
        },
      }),
      null,
    )
    expect(r.value).toBe(-10)
    expect(r.fired).toBe(false)
  })

  test('extra ticks past the finish do not fire', () => {
    const r = ticksVsRaceTime(
      fakeCtx({
        ghost: {
          inputs: [{ version: 12, u01: 0, startOffsetMs: 0, ticks: 2800, data: new Uint8Array(0) }],
        },
      }),
      null,
    )
    expect(r.value).toBe(3000)
    expect(r.fired).toBe(false)
  })

  test('start offset shifts the comparison', () => {
    const r = ticksVsRaceTime(
      fakeCtx({
        ghost: {
          inputs: [
            { version: 12, u01: 0, startOffsetMs: -1500, ticks: 2650, data: new Uint8Array(0) },
          ],
        },
      }),
      null,
    )
    expect(r.value).toBe(0)
    expect(r.fired).toBe(false)
  })

  test('not applicable without inputs', () => {
    expect(ticksVsRaceTime(fakeCtx({ ghost: { inputs: [] } }), null).applicable).toBe(false)
  })

  test.each(Object.keys(FIXTURES) as FixtureName[])(
    'does not fire on clean fixture %s',
    async (name) => {
      const ctx = await buildContext(name, parseGbx(loadFixture(name)), nodeInflate)
      expect(ticksVsRaceTime(ctx, null).fired).toBe(false)
    },
  )
})

describe('metadata', () => {
  test('lists exe version and raw chunk sizes when present', () => {
    const r = metadata(
      fakeCtx({
        ghost: {
          validation: {
            exeVersion: 'Trackmania date=2026-02-02',
            exeChecksum: 1,
            osKind: 2,
            cpuKind: 3,
            titleId: 'Trackmania',
            validationSeed: 4,
            raceSettings: 'x',
          },
          rawChunks: new Map([[0x03092023, new Uint8Array([1, 2, 3])]]),
        },
      }),
      null,
    )
    expect(r.level).toBe('info')
    expect(r.fired).toBe(false)
    expect(r.evidence.some((e) => e.includes('Trackmania date=2026-02-02'))).toBe(true)
    expect(r.evidence.some((e) => e.includes('0x03092023'))).toBe(false)
    expect(r.evidence.some((e) => e.includes('login'))).toBe(true)
  })
})

describe('ticks_vs_racetime, decoded ticks', () => {
  test('decoded ticks short of the declared count fire', () => {
    const r = ticksVsRaceTime(
      fakeCtx({
        decodedTicks: 1363,
        ghost: {
          raceTimeMs: 24794,
          inputs: [{ version: 12, u01: 0, startOffsetMs: 0, ticks: 2480, data: new Uint8Array(0) }],
        },
      }),
      null,
    )
    expect(r.fired).toBe(true)
    expect(r.value).toBe(13630 - 24794)
    expect(r.evidence.join(' ')).toContain('decoded 1363 of 2480 ticks')
  })

  test('slidrz with half its input data fires through buildContext', async () => {
    const parsed = parseGbx(loadFixture('slidrz'))
    const input = parsed.ghosts[0]!.inputs[0]!
    input.data = input.data.slice(0, input.data.length >> 1)
    const ctx = await buildContext('cut', parsed, nodeInflate)
    expect(ctx.decodedTicks).toBeLessThan(input.ticks)
    const r = ticksVsRaceTime(ctx, null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toMatch(/decoded \d+ of 2480 ticks/)
  })
})

describe('wall_time_delta, one-sided fence', () => {
  test('a wall time shorter than typical does not fire, only extra seconds are suspicious', () => {
    const ctx = fakeCtx({
      device: 'pad',
      ghost: { raceTimeMs: 25000, wallTime: { startUnixSec: 100, endUnixSec: 125, source: '02C' } },
    })
    const baseline = fakeBaseline('wall_time_delta', 'pad', { median: 1.5, q1: 1.1, q3: 1.8 })
    const r = wallTimeDelta(ctx, baseline)
    expect(r.value).toBe(0)
    expect(r.fired).toBe(false)
  })
})
