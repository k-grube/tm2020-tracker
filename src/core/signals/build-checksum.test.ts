import { describe, expect, test } from 'vitest'
import type { Validation } from '../model.ts'
import { buildChecksum } from './build-checksum.ts'
import { fakeBaseline, fakeCtx } from './test-util.ts'

const EXE = 'Trackmania date=2026-02-02_17_51 git=128149-c7d05ad2551 GameVersion=3.3.0'

const validation = (exeVersion: string, exeChecksum: number): Validation => ({
  source: '02D',
  startUnixSec: 1,
  endUnixSec: 2,
  exeVersion,
  exeChecksum,
  osKind: 1,
  cpuKind: 1,
  titleId: 'Trackmania',
  validationSeed: 7,
  raceSettings: '',
  gameRules: null,
  spawnLandmark: null,
  simFlags: null,
})

const baseline = {
  ...fakeBaseline('wall_time_delta', 'pad', { median: 1, q1: 1, q3: 1 }),
  builds: { [EXE]: { checksum: 0x60cb2302, files: 634 } },
}

describe('build_checksum', () => {
  test('a known build with its checksum does not fire', () => {
    const r = buildChecksum(
      fakeCtx({ ghost: { validation: validation(EXE, 0x60cb2302) } }),
      baseline,
    )
    expect(r.level).toBe('empirical')
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.evidence[0]).toBe(`build ${EXE}, checksum 0x60cb2302, corpus 0x60cb2302 in 634 files`)
  })

  test('a known build with another checksum fires', () => {
    const r = buildChecksum(fakeCtx({ ghost: { validation: validation(EXE, 0x1) } }), baseline)
    expect(r.fired).toBe(true)
    expect(r.evidence[0]).toBe(`build ${EXE}, checksum 0x1, corpus 0x60cb2302 in 634 files`)
  })

  test('a build not in the corpus is listed without firing', () => {
    const r = buildChecksum(fakeCtx({ ghost: { validation: validation('other', 0x2) } }), baseline)
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.evidence[0]).toBe('build other, checksum 0x2, not in the corpus')
  })

  test('not applicable without validation or without a baseline', () => {
    expect(buildChecksum(fakeCtx(), baseline).applicable).toBe(false)
    const ctx = fakeCtx({ ghost: { validation: validation(EXE, 0x60cb2302) } })
    expect(buildChecksum(ctx, null).applicable).toBe(false)
  })
})
