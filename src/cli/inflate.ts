import { inflateSync } from 'node:zlib'
import type { Inflate } from '../core/model.ts'
import { ParseError } from '../core/io/errors.ts'

// zlib stops at the declared size, a stream that wants more is rejected before it is held in memory
export const inflateNode: Inflate = (compressed, uncompressedSize) => {
  let out: Uint8Array
  try {
    out = inflateSync(compressed, { maxOutputLength: Math.max(uncompressedSize, 1) })
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'ERR_BUFFER_TOO_LARGE') {
      throw new ParseError(`zlib output exceeds declared ${uncompressedSize} bytes`, 0)
    }
    throw new ParseError(`zlib: ${e instanceof Error ? e.message : String(e)}`, 0)
  }
  if (out.length !== uncompressedSize) {
    throw new ParseError(`zlib inflated to ${out.length} bytes, expected ${uncompressedSize}`, 0)
  }
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}
