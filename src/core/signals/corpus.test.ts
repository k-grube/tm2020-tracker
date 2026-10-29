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

  test('the positions cover three times the distance the speed allows', async () => {
    const bytes = loadCorpusFixture('deleteCheatWRs')
    const r = (await analyzeBytes([{ name: 'd', bytes }], null, inflateNode)).files[0]!
    const ratio = r.signals.find((s) => s.id === 'path_speed_ratio')!
    expect(ratio.fired).toBe(true)
    expect(ratio.value).toBeGreaterThan(3)
    expect(ratio.evidence[0]).toBe('path 1814 m, speed allows 578 m, ratio 3.14')
  })
})

// summer 2020 map 19, 48.142 by a login whose car sat at the start for the whole race
describe('Blackpro921OG record', () => {
  test('no split has a checkpoint record and the car covers no distance', async () => {
    const bytes = loadCorpusFixture('blackpro')
    const r = (await analyzeBytes([{ name: 'b', bytes }], null, inflateNode)).files[0]!
    const records = r.signals.find((s) => s.id === 'checkpoint_records')!
    expect(records.fired).toBe(true)
    expect(records.evidence).toEqual(['cp1 48141 ms has no record'])
    const path = r.signals.find((s) => s.id === 'car_path')!
    expect(path.fired).toBe(true)
    expect(path.evidence).toEqual(['path 0 m over 48.142 s, 0.0 m/s'])
    expect(r.signals.find((s) => s.id === 'position_continuity')!.fired).toBe(false)
    expect(r.summary.needsHumanReview).toBe(true)
  })
})

// spring 2026 map 08, 3.644 by a login that passed the checkpoint during the countdown
describe('tommac1n0 record', () => {
  test('the checkpoint sits before the start and has no record', async () => {
    const bytes = loadCorpusFixture('tommac1n0')
    const r = (await analyzeBytes([{ name: 't', bytes }], null, inflateNode)).files[0]!
    const splits = r.signals.find((s) => s.id === 'checkpoint_consistency')!
    expect(splits.fired).toBe(true)
    expect(splits.evidence).toEqual(['cp1 -1540 ms at or before the start'])
    expect(r.signals.find((s) => s.id === 'checkpoint_records')!.evidence).toEqual([
      'cp1 -1540 ms has no record',
    ])
  })
})

// training map 01, 1.477 on a 7 s map, the car drove 16 m and the finish fired
describe('PixelDani record', () => {
  test('the car path per race second is far under any drive', async () => {
    const bytes = loadCorpusFixture('pixeldani')
    const r = (await analyzeBytes([{ name: 'p', bytes }], null, inflateNode)).files[0]!
    const path = r.signals.find((s) => s.id === 'car_path')!
    expect(path.fired).toBe(true)
    expect(path.evidence).toEqual(['path 16 m over 1.477 s, 11.2 m/s'])
    expect(r.summary.needsHumanReview).toBe(true)
  })
})
