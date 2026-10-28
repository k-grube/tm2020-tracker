import { describe, expect, test } from 'vitest'
import { inflateNode } from '../cli/inflate.ts'
import { parseGbx } from '../core/parse.ts'
import { analyzeBytes } from '../core/pipeline.ts'
import { loadCorpusFixture, loadFixture } from './fixtures.ts'
import { patchSkippable, uncompressedCopy } from './gbx-mutate.ts'

const SLIDRZ_START = 1754498149

describe('gbx mutation helper', () => {
  test('uncompressed copy analyzes identically', async () => {
    const original = loadFixture('slidrz')
    const copy = uncompressedCopy(original)
    expect(copy[7]).toBe(0x55)
    const a = await analyzeBytes([{ name: 'x', bytes: original }], null, inflateNode)
    const b = await analyzeBytes([{ name: 'x', bytes: copy }], null, inflateNode)
    expect(JSON.parse(JSON.stringify(b.files))).toEqual(JSON.parse(JSON.stringify(a.files)))
  })

  test('patchSkippable rewrites the wall time end', () => {
    const patched = patchSkippable(loadFixture('slidrz'), 0x0309202c, (p) => {
      const out = p.slice()
      new DataView(out.buffer).setUint32(8, SLIDRZ_START - 5, true)
      return out
    })
    expect(parseGbx(patched).ghosts[0]!.wallTime).toEqual({
      startUnixSec: SLIDRZ_START,
      endUnixSec: SLIDRZ_START - 5,
      source: '02C',
    })
  })

  test('patchSkippable grows a chunk', () => {
    const before = parseGbx(loadFixture('slidrz')).ghosts[0]!.inputs[0]!.data.length
    const patched = patchSkippable(loadFixture('slidrz'), 0x0309201d, (p) => {
      const out = new Uint8Array(p.length + 1)
      out.set(p)
      out[p.length] = 0xff
      new DataView(out.buffer).setUint32(24, p.length - 28 + 1, true)
      return out
    })
    expect(parseGbx(patched).ghosts[0]!.inputs[0]!.data.length).toBe(before + 1)
  })

  test('corpus fixtures load', () => {
    expect(parseGbx(loadCorpusFixture('jdon')).ghosts[0]!.raceTimeMs).toBe(53742)
    expect(parseGbx(loadCorpusFixture('propanoia')).ghosts[0]!.raceTimeMs).toBe(57655)
  })
})
