import { ParseError } from '../io/errors.ts'

// LZO1X-1 decompressor, instruction layout per the reference lzo1x_decompress_safe
export function lzo1xDecompress(src: Uint8Array, dstSize: number): Uint8Array {
  const out = new Uint8Array(dstSize)
  let ip = 0
  let op = 0
  let state = 0

  const inb = (): number => {
    if (ip >= src.length) {
      throw new ParseError('lzo input truncated', ip)
    }
    return src[ip++]!
  }

  const literals = (n: number): void => {
    if (ip + n > src.length) {
      throw new ParseError('lzo input truncated in literal run', ip)
    }
    if (op + n > dstSize) {
      throw new ParseError('lzo output overrun', ip)
    }
    out.set(src.subarray(ip, ip + n), op)
    ip += n
    op += n
  }

  const match = (off: number, len: number): void => {
    if (off <= 0 || off > op) {
      throw new ParseError(`lzo match offset ${off} outside output`, ip)
    }
    if (op + len > dstSize) {
      throw new ParseError('lzo output overrun', ip)
    }
    for (let i = 0; i < len; i++) {
      out[op] = out[op - off]!
      op++
    }
  }

  const longLen = (base: number): number => {
    let n = 0
    while (inb() === 0) {
      n += 255
    }
    ip--
    return n + base + inb()
  }

  let t = inb()
  if (t > 17) {
    t -= 17
    literals(t)
    state = t < 4 ? t : 4
  } else {
    ip = 0
  }

  for (;;) {
    t = inb()
    let off: number
    let len: number
    let trail: number
    if (t < 16) {
      if (state === 0) {
        if (t === 0) {
          t = longLen(15)
        }
        literals(t + 3)
        state = 4
        continue
      }
      if (state === 4) {
        off = (t >> 2) + (inb() << 2) + 2049
        len = 3
      } else {
        off = (t >> 2) + (inb() << 2) + 1
        len = 2
      }
      trail = t & 3
    } else if (t >= 64) {
      len = (t >> 5) + 1
      off = ((t >> 2) & 7) + (inb() << 3) + 1
      trail = t & 3
    } else if (t >= 32) {
      len = t & 31
      if (len === 0) {
        len = longLen(31)
      }
      const lo = inb()
      const hi = inb()
      const w = lo | (hi << 8)
      off = (w >> 2) + 1
      len += 2
      trail = w & 3
    } else {
      off = (t & 8) << 11
      len = t & 7
      if (len === 0) {
        len = longLen(7)
      }
      const lo = inb()
      const hi = inb()
      const w = lo | (hi << 8)
      off += w >> 2
      trail = w & 3
      if (off === 0) {
        if (op !== dstSize) {
          throw new ParseError(`lzo stream ended at ${op} of ${dstSize} bytes`, ip)
        }
        return out
      }
      off += 0x4000
      len += 2
    }
    match(off, len)
    literals(trail)
    state = trail
  }
}
