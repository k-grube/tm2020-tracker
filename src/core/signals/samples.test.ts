import { describe, expect, test } from 'vitest'
import { inflateNode } from '../../cli/inflate.ts'
import { loadCorpusFixture, loadFixture } from '../../test/fixtures.ts'
import { binarySeries } from '../inputs/decode.ts'
import type { InputEvent, Sample } from '../model.ts'
import { parseGbx } from '../parse.ts'
import { analyzeBytes } from '../pipeline.ts'
import { buildContext } from './context.ts'
import { positionContinuity } from './position-continuity.ts'
import { sampleInputMatch } from './sample-input-match.ts'
import { fakeCtx, steerEvents } from './test-util.ts'

const ev = (tick: number, kind: InputEvent['kind'], value: number): InputEvent => ({
  tick,
  timeMs: tick * 10,
  kind,
  value,
})

// 50 ms samples that copy the steer series and hold gas, over a 10 s race
function samplesFrom(steer: Int8Array, gas = true): Sample[] {
  const out: Sample[] = []
  for (let t = 0; t < steer.length; t += 5) {
    out.push({
      timeMs: t * 10,
      position: [0, 0, 0],
      speedMs: 10,
      steer: steer[t]!,
      gas,
      brake: false,
    })
  }
  return out
}

function padCtx(steer: Int8Array, samples: Sample[], events: InputEvent[] = []) {
  return fakeCtx({
    device: 'pad',
    steer,
    events: [...steerEvents(Array.from(steer)), ev(0, 'gas', 1), ...events],
    samples,
    firstVehicleTick: 0,
    ghost: { raceTimeMs: steer.length * 10 },
  })
}

const analog = Int8Array.from(
  Array.from({ length: 1000 }, (_, i) => Math.round(Math.sin(i / 30) * 100)),
)

describe('binarySeries', () => {
  test('forward fills a binary input per tick', () => {
    const s = binarySeries([ev(2, 'gas', 1), ev(5, 'gas', 0)], 'gas', 8)
    expect(Array.from(s)).toEqual([0, 0, 1, 1, 1, 0, 0, 0])
  })
})

describe('sample_input_match', () => {
  test('samples copied from the inputs do not fire', () => {
    const r = sampleInputMatch(padCtx(analog, samplesFrom(analog)), null)
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.value).toBe(0)
  })

  test('inverted sample steer fires with spans', () => {
    const inverted = samplesFrom(analog).map((s) => ({ ...s, steer: -s.steer }))
    const r = sampleInputMatch(padCtx(analog, inverted), null)
    expect(r.fired).toBe(true)
    expect(r.value).toBeGreaterThan(0.9)
    expect(r.evidence.join(' ')).toContain('steer mismatch')
    expect(r.spans!.length).toBeGreaterThan(0)
  })

  test('keyboard skips the steer rule and keeps the gas rule', () => {
    const digital = Int8Array.from(
      Array.from({ length: 1000 }, (_, i) => (i % 40 < 20 ? 127 : -127)),
    )
    const ctx = fakeCtx({
      ...padCtx(digital, samplesFrom(digital, false)),
      device: 'keyboard',
    })
    const r = sampleInputMatch(ctx, null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('steer rule skipped')
    expect(r.evidence.join(' ')).toContain('gas mismatch')
  })

  test('fewer than 20 compared samples is not applicable', () => {
    const short = analog.slice(0, 50)
    const r = sampleInputMatch(padCtx(short, samplesFrom(short)), null)
    expect(r.applicable).toBe(false)
  })

  test('not applicable without samples', () => {
    expect(sampleInputMatch(fakeCtx({ steer: analog, device: 'pad' }), null).applicable).toBe(false)
  })

  test.each(['slidrz', 'tmio'] as const)('real record %s does not fire', async (name) => {
    const ctx = await buildContext(name, parseGbx(loadFixture(name)), inflateNode)
    const r = sampleInputMatch(ctx, null)
    expect(r.fired).toBe(false)
    expect(r.value).toBeLessThan(0.01)
  })

  test('propanoia has too few input ticks to compare', async () => {
    const r = (
      await analyzeBytes([{ name: 'p', bytes: loadCorpusFixture('propanoia') }], null, inflateNode)
    ).files[0]!
    const s = r.signals.find((x) => x.id === 'sample_input_match')!
    expect(s.fired).toBe(false)
  })
})

// 50 ms samples along x at 10 m/s over a 20 s race, with an optional jump of 5 m from jumpMs on
function straight(jumpMs: number | null): Sample[] {
  const out: Sample[] = []
  for (let t = 0; t <= 20000; t += 50) {
    const x = t / 100 + (jumpMs !== null && t >= jumpMs ? 5 : 0)
    out.push({ timeMs: t, position: [x, 0, 0], speedMs: 10, steer: 0, gas: true, brake: false })
  }
  return out
}

describe('position_continuity', () => {
  const ctxWith = (samples: Sample[], respawns = 0) =>
    fakeCtx({ samples, ghost: { raceTimeMs: 20000, respawns } })

  test('a continuous path does not fire', () => {
    const r = positionContinuity(ctxWith(straight(null)), null)
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.value).toBe(0)
  })

  test('a 5 m jump at 10 s with no respawn declared fires with a span there', () => {
    const r = positionContinuity(ctxWith(straight(10000)), null)
    expect(r.fired).toBe(true)
    expect(r.value).toBe(1)
    expect(r.evidence[1]).toContain('10000 ms')
    expect(r.spans![0]!.startTick).toBe(995)
  })

  test('a declared respawn covers one jump', () => {
    const r = positionContinuity(ctxWith(straight(10000), 1), null)
    expect(r.fired).toBe(false)
    expect(r.evidence[0]).toBe('1 jumps, 1 respawns declared')
  })

  test('two jumps on one declared respawn fire', () => {
    const samples = straight(10000).map((s) =>
      s.timeMs >= 15000
        ? { ...s, position: [s.position[0] + 5, 0, 0] as [number, number, number] }
        : s,
    )
    const r = positionContinuity(ctxWith(samples, 1), null)
    expect(r.value).toBe(2)
    expect(r.fired).toBe(true)
  })

  test('a second jump inside the settle second after a teleport is not counted', () => {
    const samples = straight(10000).map((s) =>
      s.timeMs >= 10500
        ? { ...s, position: [s.position[0] + 5, 0, 0] as [number, number, number] }
        : s,
    )
    expect(positionContinuity(ctxWith(samples), null).value).toBe(1)
  })

  test('a jump inside the last 200 ms is excluded', () => {
    const r = positionContinuity(ctxWith(straight(19900)), null)
    expect(r.fired).toBe(false)
  })

  test('not applicable without samples', () => {
    expect(positionContinuity(fakeCtx(), null).applicable).toBe(false)
  })

  test.each(['slidrz', 'tmio', 'localReplay', 'localPbReplay'] as const)(
    'real file %s does not fire',
    async (name) => {
      const ctx = await buildContext(name, parseGbx(loadFixture(name)), inflateNode)
      expect(positionContinuity(ctx, null).fired).toBe(false)
    },
  )

  test('propanoia jumps only at its last sample', async () => {
    const ctx = await buildContext('p', parseGbx(loadCorpusFixture('propanoia')), inflateNode)
    expect(positionContinuity(ctx, null).fired).toBe(false)
  })
})

describe('sample_input_match, action keys', () => {
  const scaled = (k: number, flip = false) =>
    samplesFrom(analog).map((s) => ({
      ...s,
      steer: Math.round(s.steer * k) * (flip ? -1 : 1),
    }))

  test('a steer held at 80% of the input is an action key, not a mismatch', () => {
    expect(sampleInputMatch(padCtx(analog, scaled(0.8)), null).fired).toBe(false)
    expect(sampleInputMatch(padCtx(analog, scaled(0.6)), null).fired).toBe(false)
  })

  test('a steer at half the input fires', () => {
    expect(sampleInputMatch(padCtx(analog, scaled(0.5)), null).fired).toBe(true)
  })

  test('a steer at 80% with the sign flipped fires', () => {
    expect(sampleInputMatch(padCtx(analog, scaled(0.8, true)), null).fired).toBe(true)
  })
})
