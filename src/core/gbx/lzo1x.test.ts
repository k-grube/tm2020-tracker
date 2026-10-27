import { describe, expect, test } from 'vitest'
import { lzo1xDecompress } from './lzo1x.ts'
import { parseHeader } from './header.ts'
import { ParseError } from '../io/errors.ts'
import { ByteReader } from '../io/byte-reader.ts'
import { loadFixture, type FixtureName } from '../../test/fixtures.ts'

const EOF = [0x11, 0x00, 0x00]
const text = (s: string) => Array.from(new TextEncoder().encode(s))

function fixtureBody(name: FixtureName): { compressed: Uint8Array; dstSize: number } {
  const bytes = loadFixture(name)
  const h = parseHeader(bytes)
  const r = new ByteReader(bytes, h.bodyOffset)
  const dstSize = r.u32()
  const compressedSize = r.u32()
  return { compressed: r.bytes(compressedSize), dstSize }
}

describe('lzo1xDecompress', () => {
  test('literal-only stream', () => {
    const src = new Uint8Array([17 + 5, ...text('abcde'), ...EOF])
    expect(Array.from(lzo1xDecompress(src, 5))).toEqual(text('abcde'))
  })

  test('overlapping match copy', () => {
    // literal 'ab', then M2: len 4, offset 2 -> 'ababab'
    const src = new Uint8Array([17 + 2, ...text('ab'), 0x64, 0x00, ...EOF])
    expect(Array.from(lzo1xDecompress(src, 6))).toEqual(text('ababab'))
  })

  test('slidrz body decompresses to header size', () => {
    const { compressed, dstSize } = fixtureBody('slidrz')
    expect(dstSize).toBe(32809)
    const out = lzo1xDecompress(compressed, dstSize)
    expect(out.length).toBe(32809)
    expect(Array.from(out.subarray(0, 4))).toEqual([0x06, 0xf0, 0x03, 0x03])
    const piks = [0x50, 0x49, 0x4b, 0x53]
    const found = out.findIndex((_, i) => piks.every((b, j) => out[i + j] === b))
    expect(found).toBeGreaterThan(0)
  })

  test('tmio body decompresses', () => {
    const { compressed, dstSize } = fixtureBody('tmio')
    const out = lzo1xDecompress(compressed, dstSize)
    expect(out.length).toBe(dstSize)
    expect(Array.from(out.subarray(0, 4))).toEqual([0x06, 0xf0, 0x03, 0x03])
  })

  test('truncated stream throws ParseError', () => {
    const { compressed, dstSize } = fixtureBody('slidrz')
    const half = compressed.subarray(0, compressed.length >> 1)
    expect(() => lzo1xDecompress(half, dstSize)).toThrow(ParseError)
  })

  test('wrong dstSize throws ParseError', () => {
    const { compressed, dstSize } = fixtureBody('slidrz')
    expect(() => lzo1xDecompress(compressed, dstSize + 1)).toThrow(ParseError)
    expect(() => lzo1xDecompress(compressed, dstSize - 1)).toThrow(ParseError)
  })
})
