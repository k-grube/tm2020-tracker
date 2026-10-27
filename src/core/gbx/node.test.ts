import { describe, expect, test } from 'vitest'
import {
  readNode,
  readNodeRef,
  UnknownChunkError,
  type ClassDef,
  type ClassRegistry,
  type ReadContext,
} from './node.ts'
import { IdState } from './ids.ts'
import { ByteReader } from '../io/byte-reader.ts'

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const END = u32(0xfacade01)
const PIKS = u32(0x534b4950)

interface A {
  a: number
  unknown: { id: number; data: number[] }[]
}

interface B {
  child: A | null
  child2: A | null
}

const ADef: ClassDef<A> = {
  classId: 0x0aaa0000,
  create: () => ({ a: 0, unknown: [] }),
  chunks: new Map([
    [
      0x0aaa0001,
      (ctx, node) => {
        node.a = ctx.r.i32()
      },
    ],
    [
      0x0aaa0004,
      (_ctx, node, payload) => {
        node.a = payload!.u8()
      },
    ],
  ]),
  onUnknownSkippable: (node, id, data) => {
    node.unknown.push({ id, data: Array.from(data) })
  },
}

const BDef: ClassDef<B> = {
  classId: 0x0bbb0000,
  create: () => ({ child: null, child2: null }),
  chunks: new Map([
    [
      0x0bbb0001,
      (ctx, node) => {
        node.child = readNodeRef<A>(ctx)
        node.child2 = readNodeRef<A>(ctx)
      },
    ],
  ]),
}

function ctxFor(bytes: number[]): ReadContext {
  const registry: ClassRegistry = new Map()
  registry.set(ADef.classId, ADef as ClassDef<unknown>)
  registry.set(BDef.classId, BDef as ClassDef<unknown>)
  return {
    r: new ByteReader(new Uint8Array(bytes)),
    ids: new IdState(),
    nodes: new Map(),
    registry,
  }
}

describe('readNode', () => {
  test('reads known chunk then end marker', () => {
    const ctx = ctxFor([...u32(0x0aaa0001), ...u32(42), ...END])
    const node = readNode<A>(ctx, 0x0aaa0000)
    expect(node.a).toBe(42)
    expect(ctx.r.remaining()).toBe(0)
  })

  test('skips unknown skippable chunk via PIKS', () => {
    const ctx = ctxFor([...u32(0x0aaa0002), ...PIKS, ...u32(4), 1, 2, 3, 4, ...END])
    const node = readNode<A>(ctx, 0x0aaa0000)
    expect(node.unknown).toEqual([{ id: 0x0aaa0002, data: [1, 2, 3, 4] }])
  })

  test('unknown non-skippable throws UnknownChunkError naming both ids', () => {
    const ctx = ctxFor([...u32(0x0aaa0003), 0, 0, 0, 0, ...END])
    expect(() => readNode<A>(ctx, 0x0aaa0000)).toThrow(UnknownChunkError)
    try {
      readNode<A>(ctxFor([...u32(0x0aaa0003), 0, 0, 0, 0, ...END]), 0x0aaa0000)
    } catch (e) {
      const err = e as UnknownChunkError
      expect(err.classId).toBe(0x0aaa0000)
      expect(err.chunkId).toBe(0x0aaa0003)
      expect(err.message).toMatch(/0x0aaa0000/i)
      expect(err.message).toMatch(/0x0aaa0003/i)
    }
  })

  test('known skippable chunk gets a bounded payload reader', () => {
    const ctx = ctxFor([
      ...u32(0x0aaa0004),
      ...PIKS,
      ...u32(8),
      9,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...u32(0x0aaa0001),
      ...u32(7),
      ...END,
    ])
    const node = readNode<A>(ctx, 0x0aaa0000)
    expect(node.a).toBe(7)
  })

  test('unknown class id throws', () => {
    const ctx = ctxFor([...END])
    expect(() => readNode(ctx, 0x0ccc0000)).toThrow(/0x0ccc0000/i)
  })
})

describe('readNodeRef', () => {
  test('-1 is null', () => {
    const ctx = ctxFor([...u32(0x0bbb0001), ...u32(0xffffffff), ...u32(0xffffffff), ...END])
    const node = readNode<B>(ctx, 0x0bbb0000)
    expect(node.child).toBeNull()
    expect(node.child2).toBeNull()
  })

  test('new index reads class id and body, repeated index returns the same object', () => {
    const ctx = ctxFor([
      ...u32(0x0bbb0001),
      ...u32(1),
      ...u32(0x0aaa0000),
      ...u32(0x0aaa0001),
      ...u32(5),
      ...END,
      ...u32(1),
      ...END,
    ])
    const node = readNode<B>(ctx, 0x0bbb0000)
    expect(node.child?.a).toBe(5)
    expect(node.child2).toBe(node.child)
    expect(ctx.r.remaining()).toBe(0)
  })
})
