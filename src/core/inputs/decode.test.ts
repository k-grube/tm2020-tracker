import { describe, expect, test } from 'vitest'
import { decodeInputs, decodeInputStream, steerSeries } from './decode.ts'
import { ParseError } from '../io/errors.ts'
import type { PlayerInputData } from '../model.ts'
import { parseGhostFixture } from '../../test/ghost.ts'
import { parseGbx } from '../parse.ts'
import { loadCorpusFixture, loadFixture, type FixtureName } from '../../test/fixtures.ts'

const ghostOf = (name: FixtureName) => parseGbx(loadFixture(name)).ghosts[0]!

class BitWriter {
  private bits: number[] = []

  bit(v: number): this {
    this.bits.push(v & 1)
    return this
  }

  num(v: bigint, n: number): this {
    for (let i = 0; i < n; i++) {
      this.bits.push(Number((v >> BigInt(i)) & 1n))
    }
    return this
  }

  i8(v: number): this {
    return this.num(BigInt(v & 0xff), 8)
  }

  bytes(extra: number[] = []): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8) + extra.length)
    this.bits.forEach((b, i) => {
      out[i >> 3] = out[i >> 3]! | (b << (i & 7))
    })
    out.set(extra, Math.ceil(this.bits.length / 8))
    return out
  }
}

const VEHICLE = 2n

function inputData(
  data: Uint8Array,
  ticks: number,
  startOffsetMs: number | null = null,
): PlayerInputData {
  return { version: 12, u01: 0, startOffsetMs, ticks, data }
}

// tick 0: full state vehicle, mouse unchanged, steer 100 gas on; tick 1: nothing changes
function startThenSteer(): BitWriter {
  return new BitWriter()
    .bit(0)
    .bit(0)
    .num(VEHICLE, 34)
    .bit(1)
    .bit(0)
    .i8(100)
    .bit(1)
    .bit(0)
    .bit(1)
    .bit(1)
    .bit(1)
}

describe('decodeInputs', () => {
  test('vehicle start then steer and gas', () => {
    const events = decodeInputs(inputData(startThenSteer().bytes(), 2))
    expect(events).toEqual([
      { tick: 0, timeMs: 0, kind: 'steer', value: 100 },
      { tick: 0, timeMs: 0, kind: 'gas', value: 1 },
    ])
  })

  test('startOffset shifts timeMs', () => {
    const events = decodeInputs(inputData(startThenSteer().bytes(), 2, 1500))
    expect(events.map((e) => e.timeMs)).toEqual([1500, 1500])
  })

  test('action slot press and release on consecutive ticks', () => {
    const w = new BitWriter()
      .bit(0)
      .bit(0)
      .num(VEHICLE | (1n << 14n), 34)
      .bit(1)
      .bit(1)
      .bit(0)
      .bit(0)
      .num(VEHICLE, 34)
      .bit(1)
      .bit(1)
    const events = decodeInputs(inputData(w.bytes(), 2))
    expect(events).toEqual([
      { tick: 0, timeMs: 0, kind: 'actionSlot', value: 1, value2: 1 },
      { tick: 1, timeMs: 10, kind: 'actionSlot', value: 1, value2: 0 },
    ])
  })

  test('respawn bit emits a respawn event', () => {
    const w = new BitWriter()
      .bit(0)
      .bit(0)
      .num(VEHICLE | (1n << 31n), 34)
      .bit(1)
      .bit(1)
    const events = decodeInputs(inputData(w.bytes(), 1))
    expect(events).toEqual([{ tick: 0, timeMs: 0, kind: 'respawn', value: 1 }])
  })

  test('trailing nonzero bytes throw ParseError', () => {
    expect(() => decodeInputs(inputData(startThenSteer().bytes([0xff]), 2))).toThrow(ParseError)
  })

  test('slidrz decodes', () => {
    const g = parseGhostFixture('slidrz')
    const events = decodeInputs(g.inputs[0]!)
    const steer = events.filter((e) => e.kind === 'steer')
    expect(steer.length).toBeGreaterThan(100)
    expect(steer.every((e) => e.value >= -127 && e.value <= 127)).toBe(true)
    expect(steerSeries(events, g.inputs[0]!.ticks)).toHaveLength(g.inputs[0]!.ticks)
  })

  test('tmio decodes', () => {
    const g = parseGhostFixture('tmio')
    const events = decodeInputs(g.inputs[0]!)
    expect(events.filter((e) => e.kind === 'steer').length).toBeGreaterThan(100)
  })
})

describe('steerSeries', () => {
  test('forward-fills steer per tick, zero before the first event', () => {
    const series = steerSeries(
      [
        { tick: 2, timeMs: 20, kind: 'steer', value: 50 },
        { tick: 4, timeMs: 40, kind: 'gas', value: 1 },
        { tick: 5, timeMs: 50, kind: 'steer', value: -20 },
      ],
      7,
    )
    expect(Array.from(series)).toEqual([0, 0, 50, 50, 50, -20, -20])
  })
})

describe('decodeInputStream', () => {
  test('reports how many ticks were decoded before the data ran out', () => {
    const { events, decodedTicks } = decodeInputStream(inputData(startThenSteer().bytes(), 10))
    expect(events).toHaveLength(2)
    expect(decodedTicks).toBe(2)
  })

  test('decodes every tick of each fixture', () => {
    for (const name of ['slidrz', 'tmio', 'tmxReplay', 'localPbReplay'] as const) {
      const input = ghostOf(name).inputs[0]!
      expect(decodeInputStream(input).decodedTicks, name).toBe(input.ticks)
    }
  })
})

describe('state kinds', () => {
  // tick 1: full state kind 15, then bits that read as a brake press if treated as vehicle
  test('a state kind outside 2..4 reads no vehicle fields', () => {
    const data = startThenSteer()
      .bit(0)
      .bit(0)
      .num(15n, 34)
      .bit(1)
      .bit(0)
      .i8(0)
      .bit(0)
      .bit(1)
      .bytes()
    const events = decodeInputs(inputData(data, 3))
    expect(events.filter((e) => e.kind === 'brake')).toEqual([])
    expect(events).toHaveLength(2)
  })

  test('the manual save decodes the same events as the autosave of the same run', () => {
    const manual = decodeInputs(ghostOf('localReplay').inputs[0]!)
    const auto = decodeInputs(ghostOf('localPbReplay').inputs[0]!)
    expect(manual).toEqual(auto)
  })
})

describe('stream structure fields', () => {
  test('decoder reports the first vehicle tick, the kind sequence and the min steer', () => {
    const d = decodeInputStream(ghostOf('slidrz').inputs[0]!)
    expect(d.kinds).toEqual([2])
    expect(d.firstVehicleTick).toBe(0)
    expect(d.minSteer).toBe(-127)
    const finished = decodeInputStream(parseGbx(loadCorpusFixture('jdon')).ghosts[0]!.inputs[0]!)
    expect(finished.kinds).toEqual([2, 15])
  })

  test('fields are null on an empty stream', () => {
    const d = decodeInputStream({
      version: 12,
      u01: 0,
      startOffsetMs: 0,
      ticks: 0,
      data: new Uint8Array(0),
    })
    expect(d.kinds).toEqual([])
    expect(d.firstVehicleTick).toBeNull()
    expect(d.minSteer).toBeNull()
  })
})
