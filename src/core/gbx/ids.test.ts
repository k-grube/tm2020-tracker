import { describe, expect, test } from 'vitest'
import { IdState, readId, readIdent, readPackDesc } from './ids.ts'
import { ByteReader } from '../io/byte-reader.ts'
import { UnsupportedError } from '../io/errors.ts'

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const str = (s: string) => {
  const b = Array.from(new TextEncoder().encode(s))
  return [...u32(b.length), ...b]
}

describe('readId', () => {
  test('first id reads version then new string', () => {
    const r = new ByteReader(new Uint8Array([...u32(3), ...u32(0x40000000), ...str('abc')]))
    const s = new IdState()
    expect(readId(r, s)).toBe('abc')
    expect(s.version).toBe(3)
    expect(s.seen).toEqual(['abc'])
    expect(r.remaining()).toBe(0)
  })

  test('reference by index', () => {
    const r = new ByteReader(
      new Uint8Array([...u32(3), ...u32(0x40000000), ...str('abc'), ...u32(0x40000001)]),
    )
    const s = new IdState()
    expect(readId(r, s)).toBe('abc')
    expect(readId(r, s)).toBe('abc')
  })

  test('version is read once per state', () => {
    const r = new ByteReader(
      new Uint8Array([...u32(3), ...u32(0x40000000), ...str('a'), ...u32(0x80000000), ...str('b')]),
    )
    const s = new IdState()
    expect(readId(r, s)).toBe('a')
    expect(readId(r, s)).toBe('b')
    expect(s.seen).toEqual(['a', 'b'])
  })

  test('null id', () => {
    const r = new ByteReader(new Uint8Array([...u32(3), 0xff, 0xff, 0xff, 0xff]))
    expect(readId(r, new IdState())).toBe('')
  })

  test('numeric id', () => {
    const r = new ByteReader(new Uint8Array([...u32(3), ...u32(26)]))
    expect(readId(r, new IdState())).toBe('26')
  })

  test('version below 3 throws', () => {
    const r = new ByteReader(new Uint8Array([...u32(2), ...u32(26)]))
    expect(() => readId(r, new IdState())).toThrow(UnsupportedError)
  })
})

describe('readIdent', () => {
  test('reads id, collection, author', () => {
    const r = new ByteReader(
      new Uint8Array([
        ...u32(3),
        ...u32(0x40000000),
        ...str('MapUid'),
        ...u32(26),
        ...u32(0x40000000),
        ...str('Nadeo'),
      ]),
    )
    expect(readIdent(r, new IdState())).toEqual({ id: 'MapUid', collection: '26', author: 'Nadeo' })
  })
})

describe('readPackDesc', () => {
  test('v3 reads checksum and both strings', () => {
    const checksum = Array.from({ length: 32 }, (_, i) => i)
    const r = new ByteReader(
      new Uint8Array([3, ...checksum, ...str('Skins\\x.zip'), ...str('http://u')]),
    )
    const p = readPackDesc(r)
    expect(p.filePath).toBe('Skins\\x.zip')
    expect(p.locatorUrl).toBe('http://u')
    expect(Array.from(p.checksum!)).toEqual(checksum)
  })

  test('v1 with empty path has no locator', () => {
    const r = new ByteReader(new Uint8Array([1, ...str('')]))
    const p = readPackDesc(r)
    expect(p.filePath).toBe('')
    expect(p.locatorUrl).toBe('')
    expect(p.checksum).toBeNull()
    expect(r.remaining()).toBe(0)
  })
})
