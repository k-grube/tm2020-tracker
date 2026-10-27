import { describe, expect, test } from 'vitest'
import { ByteReader } from './byte-reader.ts'
import { ParseError } from './errors.ts'

const bytes = (...xs: number[]) => new Uint8Array(xs)

describe('ByteReader', () => {
  test('reads little-endian u32 and i32', () => {
    const r = new ByteReader(bytes(0x78, 0x56, 0x34, 0x12, 0xff, 0xff, 0xff, 0xff))
    expect(r.u32()).toBe(0x12345678)
    expect(r.i32()).toBe(-1)
    expect(r.pos).toBe(8)
  })

  test('timeint -1 is null', () => {
    const r = new ByteReader(bytes(0xff, 0xff, 0xff, 0xff, 0x10, 0x27, 0x00, 0x00))
    expect(r.timeint()).toBeNull()
    expect(r.timeint()).toBe(10000)
  })

  test('string is i32 length + utf8', () => {
    const text = new TextEncoder().encode('héllo')
    const r = new ByteReader(bytes(text.length, 0, 0, 0, ...text))
    expect(r.string()).toBe('héllo')
    expect(r.remaining()).toBe(0)
  })

  test('reading past end throws ParseError with offset', () => {
    const r = new ByteReader(bytes(1, 2))
    expect(() => r.u32()).toThrow(ParseError)
    try {
      r.u32()
    } catch (e) {
      expect((e as ParseError).offset).toBe(0)
    }
  })

  test('peekU32 does not advance', () => {
    const r = new ByteReader(bytes(0x50, 0x49, 0x4b, 0x53))
    expect(r.peekU32()).toBe(0x534b4950)
    expect(r.pos).toBe(0)
    expect(r.u32()).toBe(0x534b4950)
  })

  test('data is i32 length + bytes, bool is u32, f32 and i64 decode', () => {
    const r = new ByteReader(
      bytes(
        2,
        0,
        0,
        0,
        9,
        8,
        1,
        0,
        0,
        0,
        0,
        0,
        0x80,
        0x3f,
        0xfe,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
        0xff,
      ),
    )
    expect(Array.from(r.data())).toEqual([9, 8])
    expect(r.bool()).toBe(true)
    expect(r.f32()).toBe(1)
    expect(r.i64()).toBe(-2n)
  })
})
