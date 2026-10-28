import { describe, expect, test } from 'vitest'
import { deflateSync } from 'node:zlib'
import { inflateNode } from './inflate.ts'
import { ParseError } from '../core/io/errors.ts'

describe('inflateNode', () => {
  test('round-trips a blob of the declared size', () => {
    const raw = new Uint8Array(Array.from({ length: 500 }, (_, i) => i % 11))
    expect(Array.from(inflateNode(deflateSync(raw), raw.length) as Uint8Array)).toEqual(
      Array.from(raw),
    )
  })

  test('stops at the declared size instead of inflating a larger stream', () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array(1_000_000)))
    expect(() => inflateNode(compressed, 100)).toThrow(ParseError)
    expect(() => inflateNode(compressed, 100)).toThrow(/exceeds/)
  })
})
