import { parseHeader } from '../core/gbx/header.ts'
import { decompressBody } from '../core/parse.ts'

const PIKS = 0x534b4950
const BODY_FLAG_OFFSET = 7

// same header with the body flag set to U and the body stored raw, parseGbx reads both forms
export function uncompressedCopy(bytes: Uint8Array): Uint8Array {
  const header = parseHeader(bytes)
  const body = decompressBody(bytes, header)
  const out = new Uint8Array(header.bodyOffset + body.length)
  out.set(bytes.subarray(0, header.bodyOffset))
  out[BODY_FLAG_OFFSET] = 0x55
  out.set(body, header.bodyOffset)
  return out
}

// skippable chunk layout: u32 id, PIKS, u32 size, payload
export function findSkippable(
  body: Uint8Array,
  chunkId: number,
): { sizeOffset: number; payloadOffset: number; size: number } {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength)
  for (let i = 0; i + 12 <= body.length; i++) {
    if (dv.getUint32(i, true) === chunkId && dv.getUint32(i + 4, true) === PIKS) {
      return { sizeOffset: i + 8, payloadOffset: i + 12, size: dv.getUint32(i + 8, true) }
    }
  }
  throw new Error(`chunk 0x${chunkId.toString(16)} not found`)
}

// uncompressed copy with one skippable chunk payload replaced, size field rewritten
export function patchSkippable(
  bytes: Uint8Array,
  chunkId: number,
  edit: (payload: Uint8Array) => Uint8Array,
): Uint8Array {
  const copy = uncompressedCopy(bytes)
  const bodyOffset = parseHeader(copy).bodyOffset
  const { sizeOffset, payloadOffset, size } = findSkippable(copy.subarray(bodyOffset), chunkId)
  const start = bodyOffset + payloadOffset
  const payload = edit(copy.slice(start, start + size))
  const out = new Uint8Array(copy.length - size + payload.length)
  out.set(copy.subarray(0, start))
  new DataView(out.buffer).setUint32(bodyOffset + sizeOffset, payload.length, true)
  out.set(payload, start)
  out.set(copy.subarray(start + size), start + payload.length)
  return out
}
