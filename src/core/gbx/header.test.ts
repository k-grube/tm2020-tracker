import { describe, expect, test } from 'vitest'
import { parseHeader } from './header.ts'
import { ParseError, UnsupportedError } from '../io/errors.ts'
import { loadFixture } from '../../test/fixtures.ts'

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
}

function build(opts: {
  classId: number
  userData?: number[]
  numNodes?: number
  numExternal?: number
  magic?: number[]
}): Uint8Array {
  const userData = opts.userData ?? []
  return new Uint8Array([
    ...(opts.magic ?? [0x47, 0x42, 0x58]),
    6,
    0,
    0x42,
    0x55,
    0x43,
    0x52,
    ...u32(opts.classId),
    ...u32(userData.length),
    ...userData,
    ...u32(opts.numNodes ?? 1),
    ...u32(opts.numExternal ?? 0),
    1,
    2,
    3,
  ])
}

describe('parseHeader', () => {
  test('slidrz header', () => {
    const h = parseHeader(loadFixture('slidrz'))
    expect(h.version).toBe(6)
    expect(h.format).toBe('B')
    expect(h.bodyCompressed).toBe(true)
    expect(h.classId).toBe(0x03092000)
    expect(h.headerChunks).toEqual([])
    expect(h.numNodes).toBe(2)
    expect(h.bodyOffset).toBe(25)
  })

  test('tmio header', () => {
    const h = parseHeader(loadFixture('tmio'))
    expect(h.classId).toBe(0x03092000)
    expect(h.bodyOffset).toBe(25)
  })

  test('tmx replay header has three header chunks', () => {
    const h = parseHeader(loadFixture('tmxReplay'))
    expect(h.classId).toBe(0x03093000)
    expect(h.headerChunks.map((c) => c.id)).toEqual([0x03093000, 0x03093001, 0x03093002])
    expect(h.headerChunks.map((c) => c.data.length)).toEqual([144, 463, 100])
    expect(h.headerChunks.map((c) => c.heavy)).toEqual([false, true, false])
    expect(h.bodyOffset).toBe(17 + 735 + 8)
  })

  test('bad magic throws ParseError', () => {
    expect(() => parseHeader(build({ classId: 1, magic: [0x47, 0x42, 0x59] }))).toThrow(ParseError)
  })

  test('external refs throw UnsupportedError', () => {
    expect(() => parseHeader(build({ classId: 1, numExternal: 1 }))).toThrow(UnsupportedError)
  })

  test('header chunk table with heavy flag', () => {
    const userData = [...u32(1), ...u32(0x0aaa0001), ...u32(0x80000004), 9, 9, 9, 9]
    const h = parseHeader(build({ classId: 0x0aaa0000, userData }))
    expect(h.headerChunks).toHaveLength(1)
    expect(h.headerChunks[0]!.id).toBe(0x0aaa0001)
    expect(h.headerChunks[0]!.heavy).toBe(true)
    expect(Array.from(h.headerChunks[0]!.data)).toEqual([9, 9, 9, 9])
    expect(h.bodyOffset).toBe(17 + userData.length + 8)
  })

  test('user data whose chunk sizes do not add up throws ParseError', () => {
    const userData = [...u32(1), ...u32(0x0aaa0001), ...u32(8), 9, 9, 9, 9]
    expect(() => parseHeader(build({ classId: 0x0aaa0000, userData }))).toThrow(ParseError)
  })
})
