import { describe, expect, test } from 'vitest'
import { inflateNode } from '../../cli/inflate.ts'
import { loadCorpusFixture, loadFixture } from '../../test/fixtures.ts'
import { patchSkippable } from '../../test/gbx-mutate.ts'
import { parseGbx } from '../parse.ts'
import { analyzeBytes } from '../pipeline.ts'
import { fakeCtx } from './test-util.ts'
import { validationConsistency } from './validation-consistency.ts'

const SLIDRZ_START = 1754498149

const setU32 = (p: Uint8Array, offset: number, v: number): Uint8Array => {
  const out = p.slice()
  new DataView(out.buffer).setUint32(offset, v, true)
  return out
}

async function run(bytes: Uint8Array) {
  const r = (await analyzeBytes([{ name: 'x', bytes }], null, inflateNode)).files[0]!
  const s = r.signals.find((x) => x.id === 'validation_consistency')!
  return { s, text: s.evidence.join(' '), review: r.summary.needsHumanReview }
}

describe('validation_consistency', () => {
  test('untouched records do not fire', async () => {
    for (const name of ['slidrz', 'tmio'] as const) {
      const { s } = await run(loadFixture(name))
      expect(s.level).toBe('empirical')
      expect(s.applicable).toBe(true)
      expect(s.fired).toBe(false)
    }
  })

  test('wall end before start fires', async () => {
    const bytes = patchSkippable(loadFixture('slidrz'), 0x0309202c, (p) =>
      setU32(p, 8, SLIDRZ_START - 5),
    )
    const { s, text, review } = await run(bytes)
    expect(s.fired).toBe(true)
    expect(text).toContain('before start')
    expect(text).toContain('02C')
    expect(review).toBe(true)
  })

  test('a changed 025 seed fires', async () => {
    const v = parseGbx(loadFixture('slidrz')).ghosts[0]!.validation025!
    const len = (s: string) => new TextEncoder().encode(s).length
    const seedAt = 24 + 4 + len(v.exeVersion) + 12 + 4 + len(v.raceSettings)
    const bytes = patchSkippable(loadFixture('slidrz'), 0x03092025, (p) =>
      setU32(p, seedAt, v.validationSeed + 1),
    )
    const { s, text } = await run(bytes)
    expect(s.fired).toBe(true)
    expect(text).toContain('seed')
    expect(text).toContain('025')
  })

  test('a recording that starts before the build date fires', async () => {
    const bytes = patchSkippable(loadFixture('slidrz'), 0x0309202c, (p) => setU32(p, 4, 1000))
    const { s, text } = await run(bytes)
    expect(s.fired).toBe(true)
    expect(text).toContain('build')
  })

  test('propanoia fires on the unset end and the zero seed', async () => {
    const { s, text, review } = await run(loadCorpusFixture('propanoia'))
    expect(s.fired).toBe(true)
    expect(text).toContain('4294967295')
    expect(text).toContain('seed 0')
    expect(review).toBe(true)
  })

  test('not applicable without validation and wall time', () => {
    expect(validationConsistency(fakeCtx(), null).applicable).toBe(false)
  })
})
