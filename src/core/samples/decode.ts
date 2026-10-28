import { ByteReader } from '../io/byte-reader.ts'
import { ParseError, UnsupportedError } from '../io/errors.ts'
import type { EntRecordData, Inflate, Sample } from '../model.ts'

// a few hours of samples, anything larger is a crafted file
export const MAX_RECORD_DATA_BYTES = 128 * 1024 * 1024

export const VEHICLE_CLASS = 0x0a018000

// transform block inside a vehicle sample payload: vec3 position, u16 angle, i16 heading, i16 pitch, i16 log speed, i8, i8
const TRANSFORM_OFFSET = 47
const LOG_SPEED_OFFSET = TRANSFORM_OFFSET + 12 + 2 + 2 + 2
const MIN_PAYLOAD = LOG_SPEED_OFFSET + 2

function decodeVehicle(timeMs: number, buf: Uint8Array): Sample {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const position: [number, number, number] = [
    dv.getFloat32(TRANSFORM_OFFSET, true),
    dv.getFloat32(TRANSFORM_OFFSET + 4, true),
    dv.getFloat32(TRANSFORM_OFFSET + 8, true),
  ]
  const speedMs = Math.exp(dv.getInt16(LOG_SPEED_OFFSET, true) / 1000)
  return { timeMs, position, speedMs }
}

// decompressed CPlugEntRecordData body, vehicle entities only
// samples are inline records below version 11 and column delta-coded from 11 on
export async function decodeSamples(data: EntRecordData, inflate: Inflate): Promise<Sample[]> {
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

  const descs: number[] = []
  const numDescs = r.u32()
  for (let i = 0; i < numDescs; i++) {
    descs.push(r.u32())
    r.i32()
    r.i32()
    r.i32()
    r.data()
    r.i32()
  }
  const numNotices = r.u32()
  for (let i = 0; i < numNotices; i++) {
    r.i32()
    r.i32()
    if (v >= 4) {
      r.u32()
    }
  }

  const samples: Sample[] = []
  // continuation flag for the next element sits after the samples, before the secondary list
  let more = r.u8() !== 0
  while (more) {
    const type = r.i32()
    r.i32()
    r.i32()
    r.i32()
    if (v >= 6) {
      r.i32()
    }
    const bufs: Uint8Array[] = []
    const times: number[] = []
    if (v < 11) {
      while (r.u8() !== 0) {
        times.push(r.i32())
        bufs.push(r.data())
      }
    } else if (r.i32() > 0) {
      r.pos -= 4
      const numSamples = r.i32()
      const sampleSize = r.i32()
      if (numSamples < 0 || sampleSize < 0 || numSamples * sampleSize > r.remaining()) {
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
        bufs.push(new Uint8Array(sampleSize))
      }
      // each payload byte is delta-coded down its column
      for (let i = 0; i < sampleSize; i++) {
        const col = r.bytes(numSamples)
        let acc = 0
        for (let s = 0; s < numSamples; s++) {
          acc = (acc + col[s]!) & 0xff
          bufs[s]![i] = acc
        }
      }
      let t = 0
      for (const d of deltas) {
        t += d
        times.push(t)
      }
    }
    more = r.u8() !== 0
    while (r.u8() !== 0) {
      r.i32()
      r.i32()
      r.data()
    }
    if (descs[type] === VEHICLE_CLASS) {
      for (let s = 0; s < bufs.length; s++) {
        if (bufs[s]!.length >= MIN_PAYLOAD) {
          samples.push(decodeVehicle(times[s]!, bufs[s]!))
        }
      }
    }
  }
  return samples
}
