import { describe, expect, test } from 'vitest'
import { inflateNode } from '../../cli/inflate.ts'
import { loadCorpusFixture } from '../../test/fixtures.ts'
import { analyzeBytes } from '../pipeline.ts'

// fall 2026 map 01, 19.869 by a login that posts world records and has them removed
describe('DeleteCheatWRs record', () => {
  test('thirteen teleports with no respawn declared put it under review', async () => {
    const bytes = loadCorpusFixture('deleteCheatWRs')
    const r = (await analyzeBytes([{ name: 'd', bytes }], null, inflateNode)).files[0]!
    const jumps = r.signals.find((s) => s.id === 'position_continuity')!
    expect(jumps.fired).toBe(true)
    expect(jumps.value).toBe(13)
    expect(jumps.evidence[0]).toBe('13 jumps, 0 respawns declared')
    expect(r.signals.find((s) => s.id === 'sample_input_match')!.fired).toBe(false)
    expect(r.summary.needsHumanReview).toBe(true)
  })
})
