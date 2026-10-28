import { BitReader } from '../io/bit-reader.ts'
import { ParseError, UnsupportedError } from '../io/errors.ts'
import type { InputEvent, InputKind, PlayerInputData } from '../model.ts'

export const TICK_MS = 10

type State = 'notStarted' | 'vehicle' | 'character'

const FULL_STATE_BITS: { bit: number; kind: InputKind; slot?: number; oneWay?: boolean }[] = [
  { bit: 6, kind: 'horn' },
  { bit: 12, kind: 'jump' },
  { bit: 13, kind: 'freeLook' },
  ...Array.from({ length: 9 }, (_, i) => ({
    bit: 14 + i,
    kind: 'actionSlot' as const,
    slot: i + 1,
  })),
  { bit: 23, kind: 'actionSlot', slot: 0 },
  { bit: 31, kind: 'respawn', oneWay: true },
  { bit: 33, kind: 'secondaryRespawn', oneWay: true },
]

function bitOf(v: bigint, bit: number): number {
  return Number((v >> BigInt(bit)) & 1n)
}

export interface DecodedInputs {
  events: InputEvent[]
  decodedTicks: number
  // full-state kinds in order of appearance, repeats collapsed
  kinds: number[]
  firstVehicleTick: number | null
  minSteer: number | null
}

export function decodeInputs(d: PlayerInputData): InputEvent[] {
  return decodeInputStream(d).events
}

// decodedTicks counts the ticks fully read, short of d.ticks when the data ends early
export function decodeInputStream(d: PlayerInputData): DecodedInputs {
  const b = new BitReader(d.data)
  let decodedTicks = 0
  const offset = d.startOffsetMs ?? 0
  const fullBits = d.version === 11 ? 33 : 34
  const events: InputEvent[] = []
  let state: State = 'notStarted'
  let prevFull = 0n
  let prevSteer = 0
  let prevGas = 0
  let prevBrake = 0
  let mouseX = 0
  let mouseY = 0
  const kinds: number[] = []
  let firstVehicleTick: number | null = null
  let minSteer: number | null = null

  const emit = (tick: number, kind: InputKind, value: number, value2?: number): void => {
    const ev: InputEvent = { tick, timeMs: tick * TICK_MS + offset, kind, value }
    if (value2 !== undefined) {
      ev.value2 = value2
    }
    events.push(ev)
  }

  try {
    for (let tick = 0; tick < d.ticks; tick++) {
      if (b.bit() === 0) {
        if (b.bit() === 1) {
          const s = b.read(2)
          if (state === 'vehicle') {
            const horn = bitOf(s, 1)
            if (horn !== bitOf(prevFull, 6)) {
              emit(tick, 'horn', horn)
              prevFull = horn ? prevFull | (1n << 6n) : prevFull & ~(1n << 6n)
            }
          }
        } else {
          const s = b.read(fullBits)
          const kind = Number(s & 0xfn)
          if (kind === 0xc || kind === 0xd) {
            throw new UnsupportedError('float steer inputs')
          }
          // gbx.net: 2..4 vehicle, 0 not started, anything else character (15 shows up at the finish)
          state = kind === 0 ? 'notStarted' : kind >= 2 && kind <= 4 ? 'vehicle' : 'character'
          if (kinds.at(-1) !== kind) {
            kinds.push(kind)
          }
          if (state === 'vehicle' && firstVehicleTick === null) {
            firstVehicleTick = tick
          }
          for (const f of FULL_STATE_BITS) {
            const now = bitOf(s, f.bit)
            const before = bitOf(prevFull, f.bit)
            if (now === before) {
              continue
            }
            if (f.oneWay) {
              if (now) {
                emit(tick, f.kind, 1)
              }
            } else if (f.slot !== undefined) {
              emit(tick, f.kind, f.slot, now)
            } else {
              emit(tick, f.kind, now)
            }
          }
          prevFull = s
        }
      }
      if (b.bit() === 0) {
        const x = b.readU16()
        const y = b.readU16()
        if (x !== mouseX || y !== mouseY) {
          mouseX = x
          mouseY = y
          emit(tick, 'mouse', x, y)
        }
      }
      if (state === 'vehicle') {
        if (b.bit() === 0) {
          const steer = b.readI8()
          const gas = b.bit()
          const brake = b.bit()
          if (minSteer === null || steer < minSteer) {
            minSteer = steer
          }
          if (steer !== prevSteer) {
            prevSteer = steer
            emit(tick, 'steer', steer)
          }
          if (gas !== prevGas) {
            prevGas = gas
            emit(tick, 'gas', gas)
          }
          if (brake !== prevBrake) {
            prevBrake = brake
            emit(tick, 'brake', brake)
          }
        }
      } else if (state === 'character') {
        if (b.bit() === 0) {
          b.read(8)
        }
      }
      decodedTicks = tick + 1
    }
  } catch (e) {
    // running out of bits mid-tick is the tolerated end-of-buffer case
    if (!(e instanceof ParseError)) {
      throw e
    }
  }

  const firstUnusedByte = Math.ceil(b.bitPos / 8)
  for (let i = firstUnusedByte; i < d.data.length; i++) {
    if (d.data[i] !== 0) {
      throw new ParseError('trailing input data', i)
    }
  }
  return { events, decodedTicks, kinds, firstVehicleTick, minSteer }
}

// per-tick value of a binary input, forward-filled, 0 before its first event
export function binarySeries(events: InputEvent[], kind: InputKind, ticks: number): Uint8Array {
  const out = new Uint8Array(ticks)
  let value = 0
  let next = 0
  const own = events.filter((e) => e.kind === kind)
  for (let t = 0; t < ticks; t++) {
    while (next < own.length && own[next]!.tick <= t) {
      value = own[next]!.value
      next++
    }
    out[t] = value
  }
  return out
}

// per-tick steer, forward-filled, 0 before the first steer event
export function steerSeries(events: InputEvent[], ticks: number): Int8Array {
  const out = new Int8Array(ticks)
  let value = 0
  let next = 0
  const steer = events.filter((e) => e.kind === 'steer')
  for (let t = 0; t < ticks; t++) {
    while (next < steer.length && steer[next]!.tick <= t) {
      value = steer[next]!.value
      next++
    }
    out[t] = value
  }
  return out
}
