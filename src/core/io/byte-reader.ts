import { ParseError } from './errors.ts'

const utf8 = new TextDecoder('utf-8')

export class ByteReader {
  pos: number
  readonly length: number
  private readonly view: DataView
  private readonly bytesRef: Uint8Array

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytesRef = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.pos = offset
    this.length = bytes.byteLength
  }

  remaining(): number {
    return this.length - this.pos
  }

  private need(n: number): number {
    if (n < 0 || this.pos + n > this.length) {
      throw new ParseError(`need ${n} bytes, ${this.remaining()} left`, this.pos)
    }
    const at = this.pos
    this.pos += n
    return at
  }

  u8(): number {
    return this.view.getUint8(this.need(1))
  }

  u16(): number {
    return this.view.getUint16(this.need(2), true)
  }

  u32(): number {
    return this.view.getUint32(this.need(4), true)
  }

  i32(): number {
    return this.view.getInt32(this.need(4), true)
  }

  i64(): bigint {
    return this.view.getBigInt64(this.need(8), true)
  }

  f32(): number {
    return this.view.getFloat32(this.need(4), true)
  }

  bytes(n: number): Uint8Array {
    const at = this.need(n)
    return this.bytesRef.subarray(at, at + n)
  }

  data(): Uint8Array {
    return this.bytes(this.i32())
  }

  string(): string {
    return utf8.decode(this.data())
  }

  bool(): boolean {
    return this.u32() !== 0
  }

  timeint(): number | null {
    const v = this.i32()
    return v === -1 ? null : v
  }

  skip(n: number): void {
    this.need(n)
  }

  peekU32(): number {
    if (this.pos + 4 > this.length) {
      throw new ParseError('need 4 bytes to peek', this.pos)
    }
    return this.view.getUint32(this.pos, true)
  }
}
