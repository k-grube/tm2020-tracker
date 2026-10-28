import { describe, expect, test } from 'vitest'
import { deflateSync } from 'node:zlib'
import { inflateWeb } from './inflate.ts'
import { analyzeBytes } from '../core/pipeline.ts'
import { inflateNode } from '../cli/inflate.ts'
import { ParseError } from '../core/io/errors.ts'
import { FIXTURES, loadFixture, type FixtureName } from '../test/fixtures.ts'

describe('inflateWeb', () => {
  test('inflates a zlib blob through DecompressionStream', async () => {
    const raw = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 7))
    const compressed = new Uint8Array(deflateSync(raw))
    const out = await inflateWeb(compressed, raw.length)
    expect(Array.from(out)).toEqual(Array.from(raw))
  })

  test('rejects when the inflated size differs', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array(10)))
    await expect(inflateWeb(compressed, 11)).rejects.toThrow(ParseError)
  })
})

describe('web pipeline', () => {
  test.each(Object.keys(FIXTURES) as FixtureName[])(
    'report through the browser inflate equals the cli report for %s',
    async (name) => {
      const files = [{ name, bytes: loadFixture(name) }]
      const web = await analyzeBytes(files, null, inflateWeb)
      const cli = await analyzeBytes(files, null, inflateNode)
      const strip = (r: typeof web) => ({ ...r, generatedAt: '' })
      expect(strip(web)).toEqual(strip(cli))
      expect(web.files[0]!.signals.find((s) => s.id === 'steer_spikes_per_sec')!.applicable).toBe(
        true,
      )
    },
  )
})

describe('inflateWeb, oversized stream', () => {
  test('stops at the declared size instead of inflating a larger stream', async () => {
    const compressed = new Uint8Array(deflateSync(new Uint8Array(1_000_000)))
    await expect(inflateWeb(compressed, 100)).rejects.toThrow(ParseError)
    await expect(inflateWeb(compressed, 100)).rejects.toThrow(/exceeds/)
  })
})
