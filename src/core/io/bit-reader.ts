import { ParseError } from './errors.ts'

// LSB-first bit stream, bit n is bit n % 8 of byte n / 8, nothing ever byte-aligns
export class BitReader {
  bitPos = 0
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  bitsLeft(): number {
    return this.bytes.length * 8 - this.bitPos
  }

  bit(): 0 | 1 {
    if (this.bitPos >= this.bytes.length * 8) {
      throw new ParseError('bit read past end', this.bitPos >> 3)
    }
    const b = (this.bytes[this.bitPos >> 3]! >> (this.bitPos & 7)) & 1
    this.bitPos++
    return b as 0 | 1
  }

  read(n: number): bigint {
    let v = 0n
    for (let i = 0; i < n; i++) {
      if (this.bit()) {
        v |= 1n << BigInt(i)
      }
    }
    return v
  }

  readU16(): number {
    return Number(this.read(16))
  }

  readI8(): number {
    const v = Number(this.read(8))
    return v >= 128 ? v - 256 : v
  }
}
