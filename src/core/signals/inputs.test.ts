import { describe, expect, test } from 'vitest'
import { sameTickToggle } from './same-tick-toggle.ts'
import { steerDevice } from './steer-device.ts'
import { inputDensity } from './input-density.ts'
import { steerSpikes } from './steer-spikes.ts'
import { steerRepetition } from './steer-repetition.ts'
import { inputStructure } from './input-structure.ts'
import { buildContext } from './context.ts'
import { parseGbx } from '../parse.ts'
import { inflateSync } from 'node:zlib'
import type { Inflate } from '../model.ts'
import { loadCorpusFixture, loadFixture } from '../../test/fixtures.ts'

const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))
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
    expect(r.level).toBe('empirical')
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

  test('mouse movement is not an input, it is reported on its own line', () => {
    const events = [
      ev(0, 'steer', 10),
      ev(1, 'mouse', 5, 5),
      ev(2, 'mouse', 6, 5),
      ev(3, 'mouse', 7, 5),
      ev(4, 'gas', 1),
    ]
    const r = inputDensity(fakeCtx({ events, ghost: { raceTimeMs: 1000 } }), null)
    expect(r.value).toBe(2)
    expect(r.evidence.join(' ')).toMatch(/mouse 3(\.0+)? \/ s/)
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
    expect(r.level).toBe('empirical')
    expect(r.fired).toBe(true)
    expect(r.references).toEqual([])
  })

  test('pad series without a repeat reports 0', () => {
    const r = steerRepetition(
      fakeCtx({ device: 'pad', steer: Int8Array.from(noise(600, 5)) }),
      null,
    )
    expect(r.value).toBe(0)
    expect(r.fired).toBe(false)
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
    const ctx = fakeCtx({
      device: 'pad',
      events: steerEvents([10, 20, 30, 40, 50]),
      ghost: { raceTimeMs: 1000 },
    })
    const flat = fakeBaseline('input_density', 'pad', { median: 20, q1: 20, q3: 20 })
    const r = inputDensity(ctx, flat)
    expect(r.value).toBeGreaterThan(0)
    expect(r.fired).toBe(false)
    expect(r.references.at(-1)!.low).toBe(20)
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
    const block = Array.from({ length: 24 }, (_, i) => (i + 1) * 5).flatMap((v) =>
      Array<number>(5).fill(v),
    )
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

describe('race window', () => {
  const flips = (n: number) => Array.from({ length: n }, (_, i) => (i % 2 ? 60 : -60))

  test('idle ticks after the finish do not dilute steer spikes', () => {
    const race = Int8Array.from(flips(500))
    const padded = Int8Array.from([...flips(500), ...new Array<number>(5000).fill(0)])
    const a = steerSpikes(
      fakeCtx({ steer: race, device: 'pad', firstVehicleTick: 0, ghost: { raceTimeMs: 5000 } }),
      null,
    )
    const b = steerSpikes(
      fakeCtx({ steer: padded, device: 'pad', firstVehicleTick: 0, ghost: { raceTimeMs: 5000 } }),
      null,
    )
    expect(a.value).toBeGreaterThan(50)
    expect(b.value).toBe(a.value)
  })

  test('countdown ticks before the first vehicle tick are not a window', () => {
    const steer = Int8Array.from([...new Array<number>(500).fill(0), ...flips(500)])
    const inputs = [
      { version: 12, u01: 0, startOffsetMs: -5000, ticks: 1000, data: new Uint8Array(0) },
    ]
    const r = steerSpikes(
      fakeCtx({ steer, device: 'pad', firstVehicleTick: 500, ghost: { raceTimeMs: 5000, inputs } }),
      null,
    )
    expect(r.evidence[0]).toContain('over 5 windows')
  })

  test('events after the finish do not count toward density', () => {
    const during = steerEvents(Array.from({ length: 100 }, (_, i) => i - 50))
    const after = steerEvents(Array.from({ length: 100 }, (_, i) => i - 50)).map((e) => ({
      ...e,
      tick: e.tick + 1000,
      timeMs: e.timeMs + 10000,
    }))
    const r = inputDensity(
      fakeCtx({ events: [...during, ...after], firstVehicleTick: 0, ghost: { raceTimeMs: 1000 } }),
      null,
    )
    expect(r.value).toBe(100)
  })
})

describe('input_structure', () => {
  const clean = () =>
    fakeCtx({
      events: steerEvents([10, 20]),
      kinds: [2, 15],
      firstVehicleTick: 0,
      minSteer: -127,
    })

  test('a stream shaped like every legit record does not fire', () => {
    const r = inputStructure(clean(), null)
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.value).toBe(0)
  })

  test('two input entries fire', () => {
    const base = clean()
    const input = base.ghost.inputs[0]!
    const r = inputStructure(
      fakeCtx({ ...base, ghost: { ...base.ghost, inputs: [input, input] } }),
      null,
    )
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('2 input entries')
  })

  test('a vehicle state after the finish state fires', () => {
    const r = inputStructure(fakeCtx({ ...clean(), kinds: [2, 15, 2] }), null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('2,15,2')
  })

  test('steer -128 fires', () => {
    const r = inputStructure(fakeCtx({ ...clean(), minSteer: -128 }), null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('-128')
  })

  test('a late first vehicle tick fires', () => {
    const r = inputStructure(fakeCtx({ ...clean(), firstVehicleTick: 50 }), null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('tick 50')
  })

  test('not applicable without inputs', () => {
    expect(inputStructure(fakeCtx({ ghost: { inputs: [] } }), null).applicable).toBe(false)
  })

  test.each(['slidrz', 'tmio', 'localReplay', 'localPbReplay'] as const)(
    'real file %s does not fire',
    async (name) => {
      const ctx = await buildContext(name, parseGbx(loadFixture(name)), nodeInflate)
      expect(inputStructure(ctx, null).fired).toBe(false)
    },
  )

  test('a finish word before and after the vehicle block is the shape of nine legit records', () => {
    expect(inputStructure(fakeCtx({ ...clean(), kinds: [15, 2, 15] }), null).fired).toBe(false)
    expect(inputStructure(fakeCtx({ ...clean(), kinds: [14, 2] }), null).fired).toBe(false)
  })

  test('an unknown kind fires', () => {
    const r = inputStructure(fakeCtx({ ...clean(), kinds: [2, 7] }), null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('2,7')
  })

  test('propanoia does not fire on structure', async () => {
    const ctx = await buildContext('p', parseGbx(loadCorpusFixture('propanoia')), nodeInflate)
    expect(inputStructure(ctx, null).fired).toBe(false)
  })
})
