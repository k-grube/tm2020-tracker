import { describe, expect, test } from 'vitest'
import { EntRecordDataDef } from './ent-record-data.ts'
import { readNode, type ClassDef, type ReadContext } from '../node.ts'
import { IdState } from '../ids.ts'
import { ByteReader } from '../../io/byte-reader.ts'
import { UnsupportedError } from '../../io/errors.ts'

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const END = u32(0xfacade01)

function ctxFor(bytes: number[]): ReadContext {
  const registry = new Map([[EntRecordDataDef.classId, EntRecordDataDef as ClassDef<unknown>]])
  return {
    r: new ByteReader(new Uint8Array(bytes)),
    ids: new IdState(),
    nodes: new Map(),
    registry,
  }
}

describe('EntRecordDataDef', () => {
  test('reads version, uncompressed size and compressed bytes', () => {
    const ctx = ctxFor([...u32(0x0911f000), ...u32(5), ...u32(10), ...u32(3), 1, 2, 3, ...END])
    const node = readNode<{ version: number; uncompressedSize: number; compressed: Uint8Array }>(
      ctx,
      0x0911f000,
    )
    expect(node.version).toBe(5)
    expect(node.uncompressedSize).toBe(10)
    expect(Array.from(node.compressed)).toEqual([1, 2, 3])
    expect(ctx.r.remaining()).toBe(0)
  })

  test('version below 5 throws UnsupportedError', () => {
    const ctx = ctxFor([...u32(0x0911f000), ...u32(4), ...u32(10), ...u32(3), 1, 2, 3, ...END])
    expect(() => readNode(ctx, 0x0911f000)).toThrow(UnsupportedError)
  })
})
