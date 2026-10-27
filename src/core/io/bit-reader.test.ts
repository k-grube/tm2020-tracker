import { describe, expect, test } from 'vitest'
import { BitReader } from './bit-reader.ts'
import { ParseError } from './errors.ts'

describe('BitReader', () => {
  test('bits are LSB-first within a byte', () => {
    const b = new BitReader(new Uint8Array([0b00000101]))
    expect([b.bit(), b.bit(), b.bit(), b.bit()]).toEqual([1, 0, 1, 0])
    expect(b.bitPos).toBe(4)
    expect(b.bitsLeft()).toBe(4)
  })

  test('read(10) across bytes puts the first bit read into bit 0', () => {
    const b = new BitReader(new Uint8Array([0x00, 0x02]))
    expect(b.read(10)).toBe(512n)
  })

  test('readI8 is twos complement', () => {
    const b = new BitReader(new Uint8Array([0x81]))
    expect(b.readI8()).toBe(-127)
  })

  test('readU16 is little-endian when byte-aligned', () => {
    const b = new BitReader(new Uint8Array([0x34, 0x12]))
    expect(b.readU16()).toBe(0x1234)
  })

  test('unaligned reads continue at the bit position', () => {
    // bits: 1, then 8 bits of 0x80 shifted by one
    const b = new BitReader(new Uint8Array([0b00000001, 0b00000001]))
    expect(b.bit()).toBe(1)
    expect(b.readI8()).toBe(-128)
  })

  test('reading past the end throws ParseError', () => {
    const b = new BitReader(new Uint8Array([0]))
    b.read(8)
    expect(() => b.bit()).toThrow(ParseError)
  })
})
