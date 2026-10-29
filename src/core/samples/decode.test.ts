import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { ARENA_CLASS, decodeRecordData, decodeSamples, VEHICLE_CLASS } from './decode.ts'
import { ParseError } from '../io/errors.ts'
import type { EntRecordData, Inflate } from '../model.ts'
import { parseGhostFixture } from '../../test/ghost.ts'
import { loadCorpusFixture, loadFixture } from '../../test/fixtures.ts'
import { parseGbx } from '../parse.ts'
import { pickGhost } from '../signals/context.ts'

const identity: Inflate = (c) => c
const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
const f32 = (x: number) => Array.from(new Uint8Array(new Float32Array([x]).buffer))
const buffer = (b: number[]) => [...u32(b.length), ...b]

const SAMPLE_SIZE = 103

interface Elem {
  desc: number
  samples: { t: number; buf: Uint8Array }[]
  events?: { type: number; t: number; data: number[] }[]
}

// version 11 body: descs (class, state version), notices (version, local id, class), elements
// with column-coded samples and a delta2 list each
function recordBody(
  descs: { classId: number; version?: number }[],
  notices: { version: number; localId: number; classId: number }[],
  elements: Elem[],
): number[] {
  const out: number[] = [...u32(0), ...u32(200), ...u32(descs.length)]
  for (const d of descs) {
    out.push(...u32(d.classId), ...u32(0), ...u32(0), ...u32(d.version ?? 30), ...u32(0), ...u32(0))
  }
  out.push(...u32(notices.length))
  for (const n of notices) {
    out.push(...u32(n.version), ...u32(n.localId), ...u32(n.classId))
  }
  elements.forEach((e, i) => {
    if (i === 0) {
      out.push(1)
    }
    out.push(...u32(e.desc), ...u32(0), ...u32(0), ...u32(200), ...u32(0))
    if (e.samples.length === 0) {
      out.push(...u32(0))
    } else {
      const size = e.samples[0]!.buf.length
      out.push(...u32(e.samples.length), ...u32(size))
      let last = 0
      for (const smp of e.samples) {
        out.push(...u32(smp.t - last))
        last = smp.t
      }
      for (let b = 0; b < size; b++) {
        let acc = 0
        for (const smp of e.samples) {
          out.push((smp.buf[b]! - acc) & 0xff)
          acc = smp.buf[b]!
        }
      }
    }
    out.push(i === elements.length - 1 ? 0 : 1)
    for (const ev of e.events ?? []) {
      out.push(1, ...u32(ev.type), ...u32(ev.t), ...buffer(ev.data))
    }
    out.push(0)
  })
  // the leading byte of the first element doubles as the has-next flag read before the loop
  return out
}

const at = (p: [number, number, number], patch: (t: Uint8Array) => void = () => {}) => {
  const buf = new Uint8Array(SAMPLE_SIZE)
  buf.set([...f32(p[0]), ...f32(p[1]), ...f32(p[2])], 47)
  patch(buf)
  return buf
}

// one entity of the given class with 3 samples 100 ms apart, sample 2 positioned at (1, 2, 3)
function body(classId: number, patch: (target: Uint8Array) => void = () => {}): number[] {
  return recordBody(
    [{ classId }],
    [],
    [
      {
        desc: 0,
        samples: [
          { t: 0, buf: new Uint8Array(SAMPLE_SIZE) },
          { t: 100, buf: new Uint8Array(SAMPLE_SIZE) },
          { t: 200, buf: at([1, 2, 3], patch) },
        ],
      },
    ],
  )
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

const ARENA_RECORD = (timeMs: number, landmark: number, flags: number, cp: number) => [
  ...u32(7),
  ...u32(timeMs),
  ...u32(timeMs),
  ...u32(-30 >>> 0),
  ...u32(0x7fffffff),
  ...u16(landmark),
  ...u16(flags),
  ...u32(0),
  ...u16(0),
  ...u16(cp),
  ...u16(cp),
]

describe('decodeRecordData', () => {
  const descs = [
    { classId: VEHICLE_CLASS, version: 33 },
    { classId: ARENA_CLASS, version: 3 },
  ]
  const notices = [
    { version: 3, localId: 20, classId: VEHICLE_CLASS },
    { version: 3, localId: 0, classId: VEHICLE_CLASS },
    { version: 5, localId: 21, classId: ARENA_CLASS },
  ]
  const two = (carEvents: Elem['events'] = []) =>
    recordBody(descs, notices, [
      {
        desc: 0,
        samples: [
          { t: 0, buf: at([7, 8, 9]) },
          { t: 50, buf: at([7, 8, 9]) },
        ],
        events: carEvents,
      },
      {
        desc: 0,
        samples: [
          { t: 0, buf: at([1, 2, 3]) },
          { t: 50, buf: at([1, 2, 3]) },
          { t: 100, buf: at([1, 2, 3]) },
        ],
      },
      {
        desc: 1,
        samples: [],
        events: [
          { type: 2, t: 10000, data: ARENA_RECORD(9995, 3, 0, 1) },
          { type: 2, t: 24800, data: ARENA_RECORD(24794, 1, 1, 2) },
        ],
      },
    ])

  test('the car is the element at the ghost entity index, not the longest vehicle element', async () => {
    const byIndex = await decodeRecordData(record(two()), identity, { carIndex: 0 })
    expect(byIndex.samples.map((s) => s.position[0])).toEqual([7, 7])
    expect(byIndex.stateVersion).toBe(33)
    const heuristic = await decodeRecordData(record(two()), identity, { carIndex: null })
    expect(heuristic.samples.map((s) => s.position[0])).toEqual([1, 1, 1])
    const wrong = await decodeRecordData(record(two()), identity, { carIndex: 2 })
    expect(wrong.samples.map((s) => s.position[0])).toEqual([1, 1, 1])
  })

  test('car events are named through the notice table, other elements events are not car events', async () => {
    const r = await decodeRecordData(
      record(
        two([
          { type: 1, t: 1200, data: [...u32(7), 2] },
          { type: 0, t: 10000, data: u32(7) },
          { type: 0, t: 24800, data: u32(7) },
        ]),
      ),
      identity,
      { carIndex: 0 },
    )
    expect(r.events.map((e) => [e.timeMs, e.localId, e.name])).toEqual([
      [1200, 0, 'GlassSmash'],
      [10000, 20, 'TriggeredWaypoint'],
      [24800, 20, 'TriggeredWaypoint'],
    ])
    expect(Array.from(r.events[0]!.data)).toEqual([...u32(7), 2])
  })

  test('arena player checkpoint records carry the exact time, landmark, flags and index', async () => {
    const r = await decodeRecordData(record(two()), identity, { carIndex: 0 })
    expect(r.checkpoints).toEqual([
      {
        tickMs: 10000,
        timeMs: 9995,
        diff1: -30,
        diff2: 0x7fffffff,
        landmark: 3,
        flags: 0,
        cpIndex: 1,
      },
      {
        tickMs: 24800,
        timeMs: 24794,
        diff1: -30,
        diff2: 0x7fffffff,
        landmark: 1,
        flags: 1,
        cpIndex: 2,
      },
    ])
  })

  test('a 30 byte arena record has no checkpoint index', async () => {
    const short = recordBody(descs, notices, [
      {
        desc: 1,
        samples: [],
        events: [{ type: 2, t: 100, data: ARENA_RECORD(95, 0, 1, 1).slice(0, 30) }],
      },
    ])
    const r = await decodeRecordData(record(short), identity, { carIndex: null })
    expect(r.checkpoints[0]!.cpIndex).toBeNull()
    expect(r.samples).toEqual([])
  })
})

describe('record data on the fixtures', () => {
  const ghostOf = (name: Parameters<typeof loadFixture>[0]) =>
    pickGhost(parseGbx(loadFixture(name)))!

  test.each(['slidrz', 'tmio', 'tmxReplay', 'localReplay', 'localPbReplay'] as const)(
    '%s: the entity index names a vehicle element on the 50 ms grid',
    async (name) => {
      const g = ghostOf(name)
      const r = await decodeRecordData(g.recordData!, nodeInflate, { carIndex: g.entityIndices[0] })
      expect(r.samples.length).toBeGreaterThan(100)
      const onGrid = r.samples.filter(
        (s, i) => i === 0 || s.timeMs - r.samples[i - 1]!.timeMs === 50,
      )
      expect(onGrid.length / r.samples.length).toBeGreaterThan(0.99)
      const heuristic = await decodeSamples(g.recordData!, nodeInflate, g.raceTimeMs)
      expect(r.samples.length).toBe(heuristic.length)
    },
  )

  // the finish waypoint is only there when the recording runs past the finish
  test.each(['slidrz', 'tmio', 'tmxReplay', 'localReplay', 'localPbReplay'] as const)(
    '%s: one TriggeredWaypoint per 00B checkpoint, within two ticks after it',
    async (name) => {
      const g = ghostOf(name)
      const r = await decodeRecordData(g.recordData!, nodeInflate, { carIndex: g.entityIndices[0] })
      const waypoints = r.events.filter((e) => e.name === 'TriggeredWaypoint').map((e) => e.timeMs)
      expect(waypoints.length).toBeGreaterThanOrEqual(g.checkpoints.length - 1)
      waypoints.forEach((w, i) => {
        const cp = g.checkpoints[i]!.timeMs
        expect(w % 10).toBe(0)
        expect(w).toBeGreaterThan(cp)
        expect(w - cp).toBeLessThanOrEqual(20)
      })
    },
  )

  test.each(['slidrz', 'tmio', 'tmxReplay', 'localReplay', 'localPbReplay'] as const)(
    '%s: arena checkpoint records match 00B in order, the last one flagged',
    async (name) => {
      const g = ghostOf(name)
      const r = await decodeRecordData(g.recordData!, nodeInflate, { carIndex: g.entityIndices[0] })
      expect(r.checkpoints.map((c) => c.timeMs)).toEqual(g.checkpoints.map((c) => c.timeMs))
      expect(r.checkpoints.at(-1)!.flags & 1).toBe(1)
      for (const c of r.checkpoints) {
        expect(c.tickMs % 10).toBe(0)
        expect(Math.abs(c.tickMs - c.timeMs)).toBeLessThanOrEqual(10)
      }
    },
  )
})

// vehicle state payloads built field by field, position at 47 on every version
function vehicleBuf(version: number, patch: (dv: DataView, b: Uint8Array) => void): Uint8Array {
  const sizes: Record<number, number> = { 28: 162, 30: 103, 33: 116 }
  const b = new Uint8Array(sizes[version]!)
  const dv = new DataView(b.buffer)
  b.set([...f32(1), ...f32(2), ...f32(3)], 47)
  patch(dv, b)
  return b
}

function oneSample(version: number, buf: Uint8Array): number[] {
  return recordBody(
    [{ classId: VEHICLE_CLASS, version }],
    [],
    [{ desc: 0, samples: [{ t: 0, buf }] }],
  )
}

describe('vehicle state', () => {
  test('v33: core block fields, packed word, per-wheel bytes, wetness and sim coef', async () => {
    const buf = vehicleBuf(33, (dv, b) => {
      dv.setUint16(0, 65535, true)
      dv.setUint16(2, 0, true)
      dv.setUint16(4, 32768, true)
      dv.setUint16(6, 65535, true)
      dv.setUint16(12, 32768, true)
      b[14] = 255
      b[21] = 255
      b[22] = 128
      b[23] = 255
      b[24] = 13
      b[29] = 0
      b[30] = 4
      b[31] = 0x80
      b[33] = 0x80
      b[43] = 0b01110011
      b[76] = 0x20
      dv.setUint16(59, 65535, true)
      dv.setInt16(61, 0, true)
      dv.setInt16(63, 32767, true)
      dv.setInt16(65, 0, true)
      b[67] = 0
      b[68] = 127
      b[81] = 255
      b[84] = 51
      dv.setUint32(89, (4 << 18) | 1, true)
      b[94] = 255
      b[100] = 51
      b[101] = 51
      b[102] = 204
    })
    const [smp] = (await decodeRecordData(record(oneSample(33, buf)), identity)).samples
    expect(smp!.steer).toBe(127)
    expect(smp!.simCoef).toBeCloseTo(0.8)
    const st = smp!.state!
    expect(st.frontSpeed).toBeCloseTo(10000)
    expect(st.sideSpeed).toBeCloseTo(-1000)
    expect(st.rpm).toBeCloseTo(15000.2, 0)
    expect(st.wheelRot[0]).toBeCloseTo(1608.4955)
    expect(st.wheelRot[3]).toBeCloseTo(804.26, 1)
    expect(st.turboTime).toBe(1)
    expect(st.steerAngle).toBeCloseTo((128 / 255) * 2 * Math.PI - Math.PI)
    expect(st.damper).toEqual([2, -2, -2, -2])
    expect(st.material).toEqual([13, 0, 0, 4])
    expect(st.isTurbo).toBe(true)
    expect(st.wheelsBurning).toBe(true)
    expect(st.gasPedal).toBe(1)
    expect(st.discontinuityCount).toBe(7)
    expect(st.topContact).toBe(true)
    expect(st.rotation[0]).toBeCloseTo(Math.cos(Math.PI))
    expect(st.rotation[3]).toBeCloseTo(0)
    expect(st.velocity[0]).toBeCloseTo(0)
    expect(st.velocity[2]).toBeCloseTo(1)
    expect(st.icing).toEqual([1, 0, 0, 0.2])
    expect(st.isGroundContact).toBe(true)
    expect(st.gear).toBe(4)
    expect(st.tireWear).toEqual([1, 0, 0, 0.2])
    expect(st.wetness).toBe(0.2)
  })

  test('v28: legacy raw block carries ground contact, gear and tire wear, no wetness, sim coef 1', async () => {
    const buf = vehicleBuf(28, (dv, b) => {
      dv.setUint32(89, 1, true)
      dv.setFloat32(101, 123.5, true)
      dv.setUint32(138, 3, true)
      dv.setFloat32(146, 0.5, true)
      dv.setFloat32(158, 0.25, true)
      b[102] = 7
    })
    const [smp] = (await decodeRecordData(record(oneSample(28, buf)), identity)).samples
    expect(smp!.simCoef).toBe(1)
    expect(smp!.position).toEqual([1, 2, 3])
    const st = smp!.state!
    expect(st.isGroundContact).toBe(true)
    expect(st.gear).toBe(3)
    expect(st.tireWear).toEqual([0.5, 0, 0, 0.25])
    expect(st.wetness).toBeNull()
  })

  test('v30: packed word gear, a zero sim coef byte reads as 1', async () => {
    const buf = vehicleBuf(30, (dv) => {
      dv.setUint32(89, 5 << 18, true)
    })
    const [smp] = (await decodeRecordData(record(oneSample(30, buf)), identity)).samples
    expect(smp!.simCoef).toBe(1)
    expect(smp!.state!.gear).toBe(5)
    expect(smp!.state!.isGroundContact).toBe(false)
  })

  test('a payload below the state block keeps the core fields with no state', async () => {
    const short = new Uint8Array(70)
    short.set([...f32(4), ...f32(5), ...f32(6)], 47)
    const r = await decodeRecordData(
      record(
        recordBody(
          [{ classId: VEHICLE_CLASS, version: 20 }],
          [],
          [{ desc: 0, samples: [{ t: 0, buf: short }] }],
        ),
      ),
      identity,
    )
    expect(r.samples[0]!.position).toEqual([4, 5, 6])
    expect(r.samples[0]!.state).toBeNull()
  })

  test('slidrz: front speed is the logged speed in m/s and velocity tracks the position deltas', async () => {
    const g = parseGhostFixture('slidrz')
    const r = await decodeRecordData(g.recordData!, nodeInflate, { carIndex: g.entityIndices[0] })
    expect(r.stateVersion).toBe(33)
    let close = 0
    let tracked = 0
    for (let i = 1; i < r.samples.length; i++) {
      const a = r.samples[i - 1]!
      const b = r.samples[i]!
      if (Math.abs(a.state!.frontSpeed - a.speedMs) < 0.5 + a.speedMs * 0.05) {
        close++
      }
      const dt = (b.timeMs - a.timeMs) / 1000
      const dp = a.position.map((p, k) => (b.position[k]! - p) / dt)
      const v = a.state!.velocity
      const err = Math.hypot(dp[0]! - v[0], dp[1]! - v[1], dp[2]! - v[2])
      if (err < 2 + a.speedMs * 0.1) {
        tracked++
      }
    }
    expect(close / r.samples.length).toBeGreaterThan(0.95)
    expect(tracked / r.samples.length).toBeGreaterThan(0.9)
    expect(r.samples.every((s) => s.state!.gear! >= 0 && s.state!.gear! <= 7)).toBe(true)
  })
})

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

  test('sim time coefficient from byte 102, zero reads as 1', async () => {
    const samples = await decodeSamples(
      record(
        body(VEHICLE_CLASS, (t) => {
          t[102] = 145
        }),
      ),
      identity,
    )
    expect(samples[0]!.simCoef).toBe(1)
    expect(samples[2]!.simCoef).toBeCloseTo(145 / 255)
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
