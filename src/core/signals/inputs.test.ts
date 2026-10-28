import { describe, expect, test } from 'vitest'
import { sameTickToggle } from './same-tick-toggle.ts'
import { steerDevice } from './steer-device.ts'
import { inputDensity } from './input-density.ts'
import { steerSpikes } from './steer-spikes.ts'
import { steerRepetition } from './steer-repetition.ts'
import { fakeBaseline, fakeCtx, steerEvents } from './test-util.ts'
import type { InputEvent } from '../model.ts'

const ev = (
  tick: number,
  kind: InputEvent['kind'],
  value: number,
  value2?: number,
): InputEvent => ({
  tick,
  timeMs: tick * 10,
  kind,
  value,
  ...(value2 === undefined ? {} : { value2 }),
})

describe('same_tick_toggle', () => {
  test('a press released on the next tick counts once but stays below the firing count', () => {
    const r = sameTickToggle(fakeCtx({ events: [ev(10, 'gas', 1), ev(11, 'gas', 0)] }), null)
    expect(r.level).toBe('absolute')
    expect(r.value).toBe(1)
    expect(r.fired).toBe(false)
    expect(r.evidence.some((e) => e.includes('gas'))).toBe(true)
  })

  test('three one-tick toggles stay below the firing count', () => {
    const events = [
      ev(10, 'actionSlot', 1, 1),
      ev(11, 'actionSlot', 1, 0),
      ev(20, 'actionSlot', 1, 1),
      ev(21, 'actionSlot', 1, 0),
      ev(30, 'brake', 1),
      ev(30, 'brake', 0),
    ]
    const r = sameTickToggle(fakeCtx({ events }), null)
    expect(r.value).toBe(3)
    expect(r.fired).toBe(false)
  })

  test('ten one-tick toggles fire', () => {
    const events = Array.from({ length: 10 }, (_, i) => [
      ev(10 + i * 5, 'actionSlot', 1, 1),
      ev(11 + i * 5, 'actionSlot', 1, 0),
    ]).flat()
    const r = sameTickToggle(fakeCtx({ events }), null)
    expect(r.value).toBe(10)
    expect(r.fired).toBe(true)
  })

  test('a press held for several ticks does not count', () => {
    const r = sameTickToggle(fakeCtx({ events: [ev(10, 'gas', 1), ev(15, 'gas', 0)] }), null)
    expect(r.value).toBe(0)
  })

  test('not applicable without events', () => {
    expect(sameTickToggle(fakeCtx(), null).applicable).toBe(false)
  })
})

describe('steer_device', () => {
  test('reports the device and distinct steer count', () => {
    const r = steerDevice(fakeCtx({ device: 'pad', steer: Int8Array.from([0, 10, 20, 10]) }), null)
    expect(r.level).toBe('info')
    expect(r.evidence.join(' ')).toContain('pad')
    expect(r.evidence.join(' ')).toContain('3')
  })
})

describe('input_density', () => {
  test('counts events per race second, split by steer and binary', () => {
    const events = [ev(0, 'steer', 10), ev(5, 'steer', 20), ev(9, 'gas', 1), ev(12, 'brake', 1)]
    const r = inputDensity(fakeCtx({ events, ghost: { raceTimeMs: 2000 } }), null)
    expect(r.level).toBe('relative')
    expect(r.value).toBe(2)
    expect(r.evidence.join(' ')).toMatch(/steer 1(\.0+)? \/ s/)
    expect(r.fired).toBe(false)
  })

  test('fires outside a baseline fence', () => {
    const events = [ev(0, 'steer', 10)]
    const baseline = fakeBaseline('input_density', 'pad', { median: 20, q1: 18, q3: 22 })
    const r = inputDensity(
      fakeCtx({ events, device: 'pad', ghost: { raceTimeMs: 1000 } }),
      baseline,
    )
    expect(r.fired).toBe(true)
  })
})

describe('steer_spikes_per_sec', () => {
  test('alternating +-50 every tick gives 100 spikes per window', () => {
    const steer = Int8Array.from(Array.from({ length: 300 }, (_, i) => (i % 2 ? 50 : -50)))
    const r = steerSpikes(fakeCtx({ steer, device: 'pad' }), null)
    expect(r.level).toBe('relative')
    expect(r.value).toBeGreaterThanOrEqual(99)
    expect(r.evidence.join(' ')).toContain('max window: 100')
    expect(r.references.map((x) => x.source)).toEqual(['2021', '2021'])
  })

  test('deltas below the threshold are ignored', () => {
    const steer = Int8Array.from(Array.from({ length: 300 }, (_, i) => 60 + (i % 2) * 2))
    expect(steerSpikes(fakeCtx({ steer }), null).value).toBe(0)
  })

  test('a smooth sweep has no spikes', () => {
    const steer = Int8Array.from(
      Array.from({ length: 300 }, (_, i) => Math.round(Math.sin(i / 50) * 100)),
    )
    expect(steerSpikes(fakeCtx({ steer }), null).value).toBe(0)
  })

  test('not applicable without a steer series', () => {
    expect(steerSpikes(fakeCtx(), null).applicable).toBe(false)
  })
})

describe('steer_repetition', () => {
  const block = Array.from({ length: 80 }, (_, i) => Math.round(Math.sin(i / 7) * 90))
  const noise = (n: number, seed: number) =>
    Array.from({ length: n }, (_, i) => Math.round(Math.sin(i * 0.37 + seed) * 100))

  test('keyboard makes it not applicable and not fired', () => {
    const r = steerRepetition(
      fakeCtx({ device: 'keyboard', steer: Int8Array.from([0, 127, 0, 127]) }),
      null,
    )
    expect(r.applicable).toBe(false)
    expect(r.fired).toBe(false)
  })

  test('pad series with an exact 80-tick repeat reports 80', () => {
    const steer = Int8Array.from([
      ...noise(200, 1),
      5,
      ...block,
      7,
      ...noise(150, 2),
      -5,
      ...block,
      -7,
      ...noise(100, 3),
    ])
    const r = steerRepetition(fakeCtx({ device: 'pad', steer }), null)
    expect(r.value).toBe(80)
    expect(r.evidence.join(' ')).toContain('800 ms')
  })

  test('pad series without a repeat reports 0', () => {
    const r = steerRepetition(
      fakeCtx({ device: 'pad', steer: Int8Array.from(noise(600, 5)) }),
      null,
    )
    expect(r.value).toBe(0)
  })

  test('a constant hold is not a repeat', () => {
    const steer = Int8Array.from([
      ...noise(100, 1),
      ...new Array<number>(200).fill(127),
      ...noise(100, 2),
      ...new Array<number>(200).fill(127),
    ])
    expect(steerRepetition(fakeCtx({ device: 'pad', steer }), null).value).toBe(0)
  })
})

describe('steer_spikes_per_sec, long series', () => {
  test('twenty million ticks of flat steer average zero without blowing the stack', () => {
    const r = steerSpikes(fakeCtx({ steer: new Int8Array(20_000_000), device: 'pad' }), null)
    expect(r.applicable).toBe(true)
    expect(r.value).toBe(0)
  })
})

describe('degenerate baseline', () => {
  test('a reference with no spread never fires, the value and range still show', () => {
    const block = [...Array(40).fill(10), ...Array(40).fill(20), ...Array(40).fill(30)]
    const pattern = [...block, ...block]
    const ctx = fakeCtx({
      device: 'pad',
      events: steerEvents(pattern),
      steer: Int8Array.from(pattern),
    })
    const flat = fakeBaseline('steer_repetition', 'pad', { median: 0, q1: 0, q3: 0 })
    const r = steerRepetition(ctx, flat)
    expect(r.value).toBeGreaterThan(0)
    expect(r.fired).toBe(false)
    expect(r.references.at(-1)!.low).toBe(0)
  })
})

describe('flagged spans', () => {
  test('same_tick_toggle lists each toggle as a span in ticks', () => {
    const events = [
      ev(10, 'gas', 1),
      ev(11, 'gas', 0),
      ev(30, 'actionSlot', 2, 1),
      ev(30, 'actionSlot', 2, 0),
    ]
    const r = sameTickToggle(fakeCtx({ events }), null)
    expect(r.spans).toEqual([
      { startTick: 10, endTick: 12, label: 'gas toggle' },
      { startTick: 30, endTick: 31, label: 'actionSlot 2 toggle' },
    ])
  })

  test('steer_spikes_per_sec marks windows at or above the 2021 average of max', () => {
    // 20 spikes in the first second, none in the second
    const first = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 50 : -50))
    const steer = Int8Array.from([...first, ...Array(100).fill(0)])
    const r = steerSpikes(fakeCtx({ steer, device: 'pad' }), null)
    expect(r.spans).toEqual([{ startTick: 0, endTick: 100, label: '98 spikes/s' }])
  })

  test('steer_repetition marks both copies of the repeat', () => {
    const block = [...Array(40).fill(10), ...Array(40).fill(20), ...Array(40).fill(30)]
    const pattern = [...block, ...Array(30).fill(0), ...block]
    const ctx = fakeCtx({
      device: 'pad',
      events: steerEvents(pattern),
      steer: Int8Array.from(pattern),
    })
    const r = steerRepetition(ctx, null)
    expect(r.spans).toEqual([
      { startTick: 0, endTick: 120, label: 'repeat 120 ticks' },
      { startTick: 150, endTick: 270, label: 'repeat 120 ticks' },
    ])
  })
})
