import type { Inflate } from '../core/model.ts'
import { ParseError } from '../core/io/errors.ts'

// zlib inflate on the browser's DecompressionStream, also available in Node 18+
// reads chunk by chunk and cancels once the declared size is exceeded
export const inflateWeb: Inflate = async (compressed, uncompressedSize) => {
  const reader = new Blob([compressed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    total += value.length
    if (total > uncompressedSize) {
      await reader.cancel()
      throw new ParseError(`zlib output exceeds declared ${uncompressedSize} bytes`, 0)
    }
    chunks.push(value)
  }
  if (total !== uncompressedSize) {
    throw new ParseError(`zlib inflated to ${total} bytes, expected ${uncompressedSize}`, 0)
  }
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}
