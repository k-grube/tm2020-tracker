import { describe, expect, test } from 'vitest'
import { trajectoryOverlap } from './trajectory-overlap.ts'
import { checkpointSplitMatch } from './checkpoint-split-match.ts'
import { splitCopy } from './split-copy.ts'
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

describe('trajectory_overlap, hostile times', () => {
  test('a sample span beyond the cap is not applicable instead of stepping through it', () => {
    const far = (uid: string) =>
      fakeCtx({
        ghost: { ghostUid: uid },
        samples: [
          { timeMs: 0, position: [0, 0, 0], speedMs: 0, steer: 0, gas: false, brake: false },
          {
            timeMs: 2_000_000_000,
            position: [1, 1, 1],
            speedMs: 0,
            steer: 0,
            gas: false,
            brake: false,
          },
        ],
      })
    const started = Date.now()
    const r = trajectoryOverlap(far('a'), far('b'))
    expect(Date.now() - started).toBeLessThan(500)
    expect(r.applicable).toBe(false)
    expect(r.evidence[0]).toMatch(/time range/)
  })
})

// the 026 recording id survives a re-save that changes the ghost uid
describe('pair signals on the same recording id, one login', () => {
  const cps = [
    { timeMs: 5000, stuntsScore: 0 },
    { timeMs: 9000, stuntsScore: 0 },
  ]
  const a = fakeCtx({
    name: 'a',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '1', recordingId: 'ab'.repeat(16), login: 'x', checkpoints: cps },
  })
  const b = fakeCtx({
    name: 'b',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '2', recordingId: 'ab'.repeat(16), login: 'x', checkpoints: cps },
  })

  test('trajectory_overlap is not applicable', () => {
    const r = trajectoryOverlap(a, b)
    expect(r.applicable).toBe(false)
    expect(r.evidence.join(' ')).toContain('same recording id')
  })

  test('split_copy is not applicable', () => {
    expect(splitCopy(a, b).applicable).toBe(false)
  })

  test('checkpoint_split_match is not applicable', () => {
    expect(checkpointSplitMatch(a, b).applicable).toBe(false)
  })
})

// the game never writes one recording under two logins
describe('one recording under two logins', () => {
  const cps = [{ timeMs: 5000, stuntsScore: 0 }]
  const a = fakeCtx({
    name: 'a',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '1', recordingId: 'ab'.repeat(16), login: 'x', checkpoints: cps },
  })
  const uid = fakeCtx({
    name: 'b',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '1', recordingId: null, login: 'y', checkpoints: cps },
  })
  const rec = fakeCtx({
    name: 'c',
    samples: fakeSamples(line(500)),
    ghost: { ghostUid: '2', recordingId: 'ab'.repeat(16), login: 'y', checkpoints: cps },
  })

  test('split_copy fires on a shared ghost uid', () => {
    const r = splitCopy(a, uid)
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('same ghost uid 1 across logins')
  })

  test('split_copy fires on a shared recording id', () => {
    const r = splitCopy(a, rec)
    expect(r.fired).toBe(true)
    expect(r.evidence.join(' ')).toContain('same recording id')
  })

  test('trajectory_overlap still compares', () => {
    expect(trajectoryOverlap(a, uid).applicable).toBe(true)
  })
})
