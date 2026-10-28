import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { decodeSamples } from './decode.ts'
import { ParseError } from '../io/errors.ts'
import type { EntRecordData, Inflate } from '../model.ts'
import { parseGhostFixture } from '../../test/ghost.ts'
import { loadCorpusFixture } from '../../test/fixtures.ts'
import { parseGbx } from '../parse.ts'

const identity: Inflate = (c) => c
const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const f32 = (x: number) => Array.from(new Uint8Array(new Float32Array([x]).buffer))

const VEHICLE_CLASS = 0x0a018000
const SAMPLE_SIZE = 103

// version 11 body: one entity of the given class with 3 samples 100 ms apart, sample 2 positioned at (1, 2, 3)
function body(classId: number): number[] {
  const columns: number[] = []
  const target = new Uint8Array(SAMPLE_SIZE)
  target.set([...f32(1), ...f32(2), ...f32(3)], 47)
  for (let i = 0; i < SAMPLE_SIZE; i++) {
    columns.push(0, 0, target[i]!)
  }
  return [
    ...u32(0),
    ...u32(200),
    ...u32(1),
    ...u32(classId),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    1,
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(200),
    ...u32(0),
    ...u32(3),
    ...u32(SAMPLE_SIZE),
    ...u32(0),
    ...u32(100),
    ...u32(100),
    ...columns,
    0,
    0,
  ]
}

function record(bytes: number[], version = 11): EntRecordData {
  return { version, uncompressedSize: bytes.length, compressed: new Uint8Array(bytes) }
}

// version 10 body: inline sample records (u8 flag, timeint, data) with absolute times
function inlineBody(): number[] {
  const payload = new Uint8Array(SAMPLE_SIZE)
  payload.set([...f32(4), ...f32(5), ...f32(6)], 47)
  return [
    ...u32(0),
    ...u32(300),
    ...u32(1),
    ...u32(VEHICLE_CLASS),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    1,
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(300),
    ...u32(0),
    1,
    ...u32(150),
    ...u32(SAMPLE_SIZE),
    ...Array.from(payload),
    1,
    ...u32(300),
    ...u32(SAMPLE_SIZE),
    ...Array.from(payload),
    0,
    0,
    0,
  ]
}

// version 10 body with two vehicle elements: a 2-sample object and the 3-sample car
function twoVehicleInlineBody(): number[] {
  const payloadAt = (p: [number, number, number]) => {
    const payload = new Uint8Array(SAMPLE_SIZE)
    payload.set([...f32(p[0]), ...f32(p[1]), ...f32(p[2])], 47)
    return Array.from(payload)
  }
  const sample = (t: number, p: [number, number, number]) => [
    1,
    ...u32(t),
    ...u32(SAMPLE_SIZE),
    ...payloadAt(p),
  ]
  const element = (samples: number[], more: number) => [
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(300),
    ...u32(0),
    ...samples,
    0,
    more,
    0,
  ]
  return [
    ...u32(0),
    ...u32(300),
    ...u32(1),
    ...u32(VEHICLE_CLASS),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    ...u32(0),
    1,
    ...element([...sample(150, [4, 5, 6]), ...sample(300, [4, 5, 6])], 1),
    ...element(
      [...sample(100, [7, 8, 9]), ...sample(200, [7, 8, 9]), ...sample(300, [7, 8, 9])],
      0,
    ),
  ]
}

describe('decodeSamples', () => {
  test('jdon picks the 50 ms car, not the 2565 sample element', async () => {
    const g = parseGbx(loadCorpusFixture('jdon')).ghosts[0]!
    const samples = await decodeSamples(g.recordData!, nodeInflate, g.raceTimeMs)
    expect(samples.length).toBe(1077)
    expect(samples[1]!.timeMs - samples[0]!.timeMs).toBe(50)
  })

  test('several vehicle elements keep only the one with the most samples', async () => {
    const samples = await decodeSamples(record(twoVehicleInlineBody(), 10), identity)
    expect(samples.map((s) => s.timeMs)).toEqual([100, 200, 300])
    expect(samples[0]!.position).toEqual([7, 8, 9])
  })

  test('columnar delta decoding', async () => {
    const samples = await decodeSamples(record(body(VEHICLE_CLASS)), identity)
    expect(samples.map((s) => s.timeMs)).toEqual([0, 100, 200])
    expect(samples[2]!.position).toEqual([1, 2, 3])
    expect(samples[0]!.position).toEqual([0, 0, 0])
    expect(samples[2]!.speedMs).toBeCloseTo(1)
  })

  test('inline sample records (version 10)', async () => {
    const samples = await decodeSamples(record(inlineBody(), 10), identity)
    expect(samples.map((s) => s.timeMs)).toEqual([150, 300])
    expect(samples[1]!.position).toEqual([4, 5, 6])
  })

  test('no vehicle entity gives empty array', async () => {
    const samples = await decodeSamples(record(body(0x12345678)), identity)
    expect(samples).toEqual([])
  })

  test('slidrz samples', async () => {
    const g = parseGhostFixture('slidrz')
    const samples = await decodeSamples(g.recordData!, nodeInflate)
    expect(samples.length).toBeGreaterThan(200)
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!.timeMs).toBeGreaterThan(samples[i - 1]!.timeMs)
    }
    expect(Math.abs(samples.at(-1)!.timeMs - g.raceTimeMs!)).toBeLessThan(1500)
    for (const s of samples) {
      const [x, y, z] = s.position
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true)
      expect(Math.abs(x)).toBeLessThan(4096)
      expect(Math.abs(z)).toBeLessThan(4096)
      expect(y).toBeGreaterThan(-100)
      expect(y).toBeLessThan(1024)
      expect(s.speedMs).toBeGreaterThanOrEqual(0)
      expect(s.speedMs).toBeLessThan(400)
    }
  })

  test('tmio samples decode', async () => {
    const g = parseGhostFixture('tmio')
    const samples = await decodeSamples(g.recordData!, nodeInflate)
    expect(samples.length).toBeGreaterThan(200)
  })
})

describe('hostile sample blocks', () => {
  test('a sample block larger than the data throws before allocating', async () => {
    const b = body(VEHICLE_CLASS)
    const sig = [3, 0, 0, 0, SAMPLE_SIZE, 0, 0, 0]
    const at = b.findIndex((_, i) => sig.every((x, j) => b[i + j] === x))
    expect(at).toBeGreaterThan(0)
    b.splice(at, 8, 4, 0, 0, 0, 0xf0, 0xff, 0xff, 0x7f)
    await expect(decodeSamples(record(b), identity)).rejects.toThrow(ParseError)
    await expect(decodeSamples(record(b), identity)).rejects.toThrow(/sample block/)
  })

  test('a declared size beyond the cap is rejected before inflating', async () => {
    const rec = { ...record(body(VEHICLE_CLASS)), uncompressedSize: 0x7fffffff }
    await expect(decodeSamples(rec, identity)).rejects.toThrow(ParseError)
    await expect(decodeSamples(rec, identity)).rejects.toThrow(/declares/)
  })
})
