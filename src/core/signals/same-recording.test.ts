import { describe, expect, test } from 'vitest'
import { trajectoryOverlap } from './trajectory-overlap.ts'
import { checkpointSplitMatch } from './checkpoint-split-match.ts'
import { fakeCtx, fakeSamples } from './test-util.ts'

const line = (n: number): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => [i * 0.2, 10, 5])

// one run saved twice (manual replay and autosave) shares the ghost uid, that is not a splice
describe('pair signals on the same recording', () => {
  const a = fakeCtx({
    name: 'a',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '615315754' },
  })
  const b = fakeCtx({
    name: 'b',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '615315754' },
  })

  test('trajectory_overlap is not applicable', () => {
    const r = trajectoryOverlap(a, b)
    expect(r.applicable).toBe(false)
    expect(r.fired).toBe(false)
    expect(r.evidence.join(' ')).toContain('same ghost uid')
  })

  test('checkpoint_split_match is not applicable', () => {
    expect(checkpointSplitMatch(a, b).applicable).toBe(false)
  })

  test('different uids still compare', () => {
    const c = fakeCtx({ name: 'c', samples: fakeSamples(line(500)), ghost: { ghostUid: '1' } })
    expect(trajectoryOverlap(a, c).applicable).toBe(true)
  })
})
