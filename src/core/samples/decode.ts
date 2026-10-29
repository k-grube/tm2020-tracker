import { ByteReader } from '../io/byte-reader.ts'
import { ParseError, UnsupportedError } from '../io/errors.ts'
import type {
  ArenaCheckpoint,
  DecodedRecord,
  EntRecordData,
  Inflate,
  RecordEvent,
  Sample,
  VehicleState,
} from '../model.ts'

// a few hours of samples, anything larger is a crafted file
export const MAX_RECORD_DATA_BYTES = 128 * 1024 * 1024

export const VEHICLE_CLASS = 0x0a018000
export const ARENA_CLASS = 0x032cb000

// vehicle event names by notice local id
export const VEHICLE_EVENTS = [
  'GlassSmash',
  'Horn',
  'Turbo',
  'ImpactBody',
  'ImpactWheelFront',
  'ImpactWheelBack',
  'BeginFreeWheeling',
  'EndFreeWheeling',
  'AirSpawnRelease',
  'PartDetached',
  'ImpactDetachedPart',
  'BeginNoGrip',
  'EndNoGrip',
  'BeginBulletTime',
  'EndBulletTime',
  'BeginBoost_1',
  'EndBoost',
  '_Unused0',
  'BeginBoost_2',
  'ResetHandicaps',
  'TriggeredWaypoint',
  'BeginFragile',
  '_Unused1',
  '_Unused2',
  'VehicleTransform',
]
const ARENA_CHECKPOINT_NOTICE = 21
const ARENA_RECORD_MIN = 24

// vehicle sample payload by sample version: bytes 0..84 the core block on
// version 23 and up (byte 14 steer, 15 gas, 18 brake, 47 position, 59 rotation, 65 velocity),
// 85..88 a u32, then on 24..29 raw u32/f32 fields and on 30 and up a packed word at 89, per-wheel
// bytes 93..100, wetness 101 and the simulation time coefficient 102
const STEER_OFFSET = 14
const GAS_OFFSET = 15
const BRAKE_OFFSET = 18
const TRANSFORM_OFFSET = 47
const ROTATION_OFFSET = 59
const VELOCITY_OFFSET = 65
const ICING_OFFSET = 81
const PACKED_OFFSET = 89
const WHEEL_BYTES_OFFSET = 93
const WETNESS_OFFSET = 101
const SIM_COEF_OFFSET = 102
const LEGACY_OFFSET = 89
const SAMPLE_INTERVAL_MS = 50
const MIN_PAYLOAD = VELOCITY_OFFSET + 2
const CORE_BLOCK = 85
const WHEEL_ROT_RAD = 1608.4955
const RPM_MAX = 30000

interface Desc {
  classId: number
  version: number
}

interface Notice {
  localId: number
  classId: number
}

interface Delta {
  type: number
  timeMs: number
  data: Uint8Array
}

interface Element {
  desc: number
  times: number[]
  bufs: Uint8Array[]
  deltas: Delta[]
}

export interface DecodeOptions {
  // chunk 000 entity index of the car, the longest vehicle element on the 50 ms grid without it
  carIndex?: number | null
  raceTimeMs?: number | null
}

const dir = (heading: number, pitch: number): [number, number, number] => [
  Math.cos(pitch) * Math.cos(heading),
  Math.cos(pitch) * Math.sin(heading),
  Math.sin(pitch),
]

function decodeState(dv: DataView, buf: Uint8Array, version: number): VehicleState {
  const unit = (o: number) => buf[o]! / 255
  const wheels = <T>(f: (i: number) => T): [T, T, T, T] => [f(0), f(1), f(2), f(3)]
  const angle = (dv.getUint16(ROTATION_OFFSET, true) * Math.PI) / 65535
  const axis = dir(
    (dv.getInt16(ROTATION_OFFSET + 2, true) * Math.PI) / 32767,
    (dv.getInt16(ROTATION_OFFSET + 4, true) * (Math.PI / 2)) / 32767,
  )
  const logSpeed = dv.getInt16(VELOCITY_OFFSET, true)
  const speed = logSpeed === -32768 ? 0 : Math.exp(logSpeed / 1000)
  const velDir = dir(
    (dv.getInt8(VELOCITY_OFFSET + 2) * Math.PI) / 127,
    (dv.getInt8(VELOCITY_OFFSET + 3) * (Math.PI / 2)) / 127,
  )
  const state: VehicleState = {
    frontSpeed: (dv.getUint16(0, true) / 65535) * 11000 - 1000,
    sideSpeed: (dv.getUint16(2, true) / 65535) * 2000 - 1000,
    rpm: (dv.getUint16(4, true) / 65535) * RPM_MAX,
    wheelRot: wheels((i) => (dv.getUint16(6 + 2 * i, true) / 65535) * WHEEL_ROT_RAD),
    steerAngle: unit(22) * 2 * Math.PI - Math.PI,
    turboTime: unit(21),
    damper: wheels((i) => unit(23 + 2 * i) * 4 - 2),
    material: wheels((i) => buf[24 + 2 * i]!),
    isTurbo: (buf[31]! & 0x80) !== 0,
    wheelsBurning: (buf[33]! & 0x80) !== 0,
    gasPedal: (buf[43]! & 3) / 3,
    discontinuityCount: buf[43]! >> 4,
    topContact: (buf[76]! & 0x20) !== 0,
    rotation: [Math.cos(angle), ...axis.map((c) => Math.sin(angle) * c)] as [
      number,
      number,
      number,
      number,
    ],
    velocity: velDir.map((c) => speed * c) as [number, number, number],
    icing: wheels((i) => unit(ICING_OFFSET + i)),
    isGroundContact: null,
    gear: null,
    tireWear: null,
    wetness: null,
  }
  if (version >= 30 && buf.length > SIM_COEF_OFFSET) {
    const packed = dv.getUint32(PACKED_OFFSET, true)
    state.isGroundContact = (packed & 1) !== 0
    state.gear = (packed >>> 18) & 0xf
    state.tireWear = wheels((i) => unit(WHEEL_BYTES_OFFSET + 1 + 2 * i))
    state.wetness = unit(WETNESS_OFFSET)
  } else if (version >= 24 && buf.length >= LEGACY_OFFSET + 33) {
    // u32 ground contact, u32, u32, 3 x f32, u32, u32, u8, v25+ 4 x f32, v26+ u32 gear,
    // v27+ u32, v28+ 4 x f32 tire wear, v29+ f32 wetness
    state.isGroundContact = dv.getUint32(LEGACY_OFFSET, true) !== 0
    let at = LEGACY_OFFSET + 33
    if (version >= 25) {
      at += 16
    }
    if (version >= 26 && buf.length >= at + 4) {
      state.gear = dv.getUint32(at, true)
      at += 4
    }
    if (version >= 27) {
      at += 4
    }
    if (version >= 28 && buf.length >= at + 16) {
      state.tireWear = wheels((i) => dv.getFloat32(at + 4 * i, true))
      at += 16
    }
    if (version >= 29 && buf.length >= at + 4) {
      state.wetness = dv.getFloat32(at, true)
    }
  }
  return state
}

function decodeVehicle(timeMs: number, buf: Uint8Array, version: number): Sample {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const position: [number, number, number] = [
    dv.getFloat32(TRANSFORM_OFFSET, true),
    dv.getFloat32(TRANSFORM_OFFSET + 4, true),
    dv.getFloat32(TRANSFORM_OFFSET + 8, true),
  ]
  const speedMs = Math.exp(dv.getInt16(VELOCITY_OFFSET, true) / 1000)
  const coefByte = version >= 30 && buf.length > SIM_COEF_OFFSET ? buf[SIM_COEF_OFFSET]! : 0
  return {
    timeMs,
    position,
    speedMs,
    steer: Math.ceil((buf[STEER_OFFSET]! * 254) / 255) - 127,
    gas: buf[GAS_OFFSET] !== 0,
    brake: buf[BRAKE_OFFSET] !== 0,
    simCoef: coefByte === 0 ? 1 : coefByte / 255,
    state: buf.length >= CORE_BLOCK ? decodeState(dv, buf, version) : null,
  }
}

function vehicleSamples(e: Element, version: number): Sample[] {
  const samples: Sample[] = []
  for (let s = 0; s < e.bufs.length; s++) {
    if (e.bufs[s]!.length >= MIN_PAYLOAD) {
      samples.push(decodeVehicle(e.times[s]!, e.bufs[s]!, version))
    }
  }
  return samples
}

// share of consecutive samples 50 ms apart, the car is sampled on that grid, other objects are not
function regularity(samples: Sample[]): number {
  if (samples.length < 2) {
    return 0
  }
  let onGrid = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i]!.timeMs - samples[i - 1]!.timeMs === SAMPLE_INTERVAL_MS) {
      onGrid++
    }
  }
  return onGrid / (samples.length - 1)
}

// a tie on regularity goes to the count closest to the race length, or the larger count without one
function better(a: Sample[], b: Sample[], raceTimeMs: number | null): boolean {
  const ra = regularity(a)
  const rb = regularity(b)
  if (ra !== rb) {
    return ra > rb
  }
  if (raceTimeMs === null) {
    return a.length > b.length
  }
  const off = (s: Sample[]) => Math.abs(s.length * SAMPLE_INTERVAL_MS - raceTimeMs)
  return off(a) < off(b)
}

function readSamples(r: ByteReader, v: number, e: Element): void {
  if (v < 11) {
    while (r.u8() !== 0) {
      e.times.push(r.i32())
      e.bufs.push(r.data())
    }
    return
  }
  const numSamples = r.i32()
  if (numSamples <= 0) {
    return
  }
  const sampleSize = r.i32()
  if (sampleSize < 0 || numSamples * sampleSize > r.remaining()) {
    throw new ParseError(
      `sample block ${numSamples} x ${sampleSize} exceeds ${r.remaining()} remaining bytes`,
      r.pos,
    )
  }
  const deltas: number[] = []
  for (let i = 0; i < numSamples; i++) {
    deltas.push(r.i32())
  }
  for (let i = 0; i < numSamples; i++) {
    e.bufs.push(new Uint8Array(sampleSize))
  }
  // each payload byte is delta-coded down its column
  for (let i = 0; i < sampleSize; i++) {
    const col = r.bytes(numSamples)
    let acc = 0
    for (let s = 0; s < numSamples; s++) {
      acc = (acc + col[s]!) & 0xff
      e.bufs[s]![i] = acc
    }
  }
  let t = 0
  for (const d of deltas) {
    t += d
    e.times.push(t)
  }
}

// 34 bytes on 2026 builds, 30 before: scene uid, time twice, two deltas, landmark, flags, zeros,
// checkpoint index twice
function arenaCheckpoint(d: Delta): ArenaCheckpoint {
  const r = new ByteReader(d.data)
  r.u32()
  const timeMs = r.i32()
  r.i32()
  const diff1 = r.i32()
  const diff2 = r.i32()
  const landmark = r.u16()
  const flags = r.u16()
  let cpIndex: number | null = null
  if (r.remaining() >= 8) {
    r.u32()
    r.u16()
    cpIndex = r.u16()
  }
  return { tickMs: d.timeMs, timeMs, diff1, diff2, landmark, flags, cpIndex }
}

// decompressed CPlugEntRecordData body: descs (class, state size, scene uid offset, sample
// version, initial state, u32), notices (version, local id, class), then elements with their
// samples (inline records below version 11, column delta-coded from 11 on) and a delta2 list of
// (notice index, time, data) events. the car's events are the vehicle notices, the arena player's
// notice 21 is the checkpoint record
export async function decodeRecordData(
  data: EntRecordData,
  inflate: Inflate,
  opts: DecodeOptions = {},
): Promise<DecodedRecord> {
  if (data.uncompressedSize < 0 || data.uncompressedSize > MAX_RECORD_DATA_BYTES) {
    throw new ParseError(
      `record data declares ${data.uncompressedSize} bytes, cap ${MAX_RECORD_DATA_BYTES}`,
      0,
    )
  }
  const v = data.version
  if (v < 6) {
    throw new UnsupportedError(`ent record data version ${v}, need 6+`)
  }
  const body = await inflate(data.compressed, data.uncompressedSize)
  const r = new ByteReader(body)
  r.timeint()
  r.timeint()

  const descs: Desc[] = []
  const numDescs = r.u32()
  for (let i = 0; i < numDescs; i++) {
    const classId = r.u32()
    r.i32()
    r.i32()
    const version = r.i32()
    r.data()
    r.i32()
    descs.push({ classId, version })
  }
  const notices: Notice[] = []
  const numNotices = r.u32()
  for (let i = 0; i < numNotices; i++) {
    r.i32()
    const localId = r.i32()
    const classId = r.u32()
    notices.push({ localId, classId })
  }

  const elements: Element[] = []
  // continuation flag for the next element sits after the samples, before the delta2 list
  let more = r.u8() !== 0
  while (more) {
    const e: Element = { desc: r.i32(), times: [], bufs: [], deltas: [] }
    r.i32()
    r.i32()
    r.i32()
    r.i32()
    readSamples(r, v, e)
    more = r.u8() !== 0
    while (r.u8() !== 0) {
      e.deltas.push({ type: r.i32(), timeMs: r.i32(), data: r.data() })
    }
    elements.push(e)
  }

  const classOf = (e: Element): number => descs[e.desc]?.classId ?? 0
  const versionOf = (e: Element): number => descs[e.desc]?.version ?? 0
  const carIndex = opts.carIndex ?? null
  let car = carIndex !== null ? (elements[carIndex] ?? null) : null
  let samples: Sample[] =
    car && classOf(car) === VEHICLE_CLASS ? vehicleSamples(car, versionOf(car)) : []
  if (!car || classOf(car) !== VEHICLE_CLASS) {
    car = null
    for (const e of elements) {
      if (classOf(e) !== VEHICLE_CLASS) {
        continue
      }
      const candidate = vehicleSamples(e, versionOf(e))
      if (!car || better(candidate, samples, opts.raceTimeMs ?? null)) {
        car = e
        samples = candidate
      }
    }
  }

  const events: RecordEvent[] = []
  for (const d of car?.deltas ?? []) {
    const notice = notices[d.type]
    if (notice?.classId !== VEHICLE_CLASS) {
      continue
    }
    const name = VEHICLE_EVENTS[notice.localId] ?? `event ${notice.localId}`
    events.push({ timeMs: d.timeMs, localId: notice.localId, name, data: d.data })
  }
  const checkpoints: ArenaCheckpoint[] = []
  for (const e of elements) {
    if (classOf(e) !== ARENA_CLASS) {
      continue
    }
    for (const d of e.deltas) {
      const notice = notices[d.type]
      if (
        notice?.classId === ARENA_CLASS &&
        notice.localId === ARENA_CHECKPOINT_NOTICE &&
        d.data.length >= ARENA_RECORD_MIN
      ) {
        checkpoints.push(arenaCheckpoint(d))
      }
    }
  }
  return {
    samples,
    events,
    checkpoints,
    stateVersion: car ? (descs[car.desc]?.version ?? null) : null,
  }
}

export async function decodeSamples(
  data: EntRecordData,
  inflate: Inflate,
  raceTimeMs: number | null = null,
): Promise<Sample[]> {
  return (await decodeRecordData(data, inflate, { raceTimeMs })).samples
}
