import { inflateSync } from 'node:zlib'
import type { Inflate } from '../core/model.ts'
import { ParseError } from '../core/io/errors.ts'

export const inflateNode: Inflate = (compressed, uncompressedSize) => {
  const out = inflateSync(compressed)
  if (out.length !== uncompressedSize) {
    throw new ParseError(`zlib inflated to ${out.length} bytes, expected ${uncompressedSize}`, 0)
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}
