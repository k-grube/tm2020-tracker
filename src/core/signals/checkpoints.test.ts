import { describe, expect, test } from 'vitest'
import { inflateNode } from '../../cli/inflate.ts'
import { loadFixture } from '../../test/fixtures.ts'
import { patchSkippable } from '../../test/gbx-mutate.ts'
import { parseGbx } from '../parse.ts'
import { analyzeBytes } from '../pipeline.ts'
import { checkpointConsistency } from './checkpoint-consistency.ts'
import { fakeCtx } from './test-util.ts'

async function run(bytes: Uint8Array) {
  const r = (await analyzeBytes([{ name: 'x', bytes }], null, inflateNode)).files[0]!
  const s = r.signals.find((x) => x.id === 'checkpoint_consistency')!
  return { s, text: s.evidence.join(' '), review: r.summary.needsHumanReview }
}

describe('checkpoint chunks', () => {
  test('slidrz 01B deltas and 02B times agree with 00B', () => {
    const g = parseGbx(loadFixture('slidrz')).ghosts[0]!
    const times = g.checkpoints.map((c) => c.timeMs)
    let sum = 0
    const cumulative = g.checkpoints01b!.deltasMs.map((d) => (sum += d))
    expect(cumulative).toEqual(times)
    expect(g.checkpoints01b!.totalMs).toBe(24794)
    expect(g.checkpoints02b!.entries.map((e) => e.timeMs)).toEqual(times)
    expect(g.checkpoints02b!.totalMs).toBe(24794)
    expect(g.unknownChunks).not.toContain(0x0309201b)
    expect(g.unknownChunks).not.toContain(0x0309202b)
  })
})

describe('checkpoint chunks, 01B second word', () => {
  test('a nonzero second u16 in 01B still reads six deltas', () => {
    const bytes = patchSkippable(loadFixture('slidrz'), 0x0309201b, (p) => {
      const out = p.slice()
      new DataView(out.buffer).setUint16(6, 2, true)
      return out
    })
    const g = parseGbx(bytes).ghosts[0]!
    expect(g.checkpoints01b!.deltasMs).toHaveLength(6)
    expect(g.checkpoints01b!.totalMs).toBe(24794)
  })
})

describe('checkpoint_consistency', () => {
  test('untouched files do not fire', async () => {
    for (const name of ['slidrz', 'tmio', 'localReplay', 'localPbReplay'] as const) {
      const { s } = await run(loadFixture(name))
      expect(s.level).toBe('absolute')
      expect(s.applicable).toBe(true)
      expect(s.fired).toBe(false)
    }
  })

  test('a shifted cp1 time fires', async () => {
    const bytes = patchSkippable(loadFixture('slidrz'), 0x0309200b, (p) => {
      const out = p.slice()
      const dv = new DataView(out.buffer)
      dv.setInt32(4, dv.getInt32(4, true) + 1, true)
      return out
    })
    const { s, text, review } = await run(bytes)
    expect(s.fired).toBe(true)
    expect(text).toContain('cp1')
    expect(review).toBe(true)
  })

  test('not applicable without 00B checkpoints', () => {
    const ctx = fakeCtx({
      ghost: { checkpoints: [], checkpoints01b: { totalMs: 25000, deltasMs: [25000] } },
    })
    const r = checkpointConsistency(ctx, null)
    expect(r.applicable).toBe(false)
    expect(r.fired).toBe(false)
  })

  test('a last checkpoint off the race time fires', () => {
    const ctx = fakeCtx({
      ghost: { raceTimeMs: 25000, checkpoints: [{ timeMs: 24000, stuntsScore: 0 }] },
    })
    const r = checkpointConsistency(ctx, null)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('24000')
  })
})
