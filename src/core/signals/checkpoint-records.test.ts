import { describe, expect, test } from 'vitest'
import { checkpointRecords } from './checkpoint-records.ts'
import { fakeCtx } from './test-util.ts'
import type { ArenaCheckpoint } from '../model.ts'

const record = (timeMs: number, flags = 0): ArenaCheckpoint => ({
  tickMs: Math.floor(timeMs / 10) * 10,
  timeMs,
  diff1: 0,
  diff2: 0x7fffffff,
  landmark: 1,
  flags,
  cpIndex: null,
})

const ctxWith = (
  cps: number[],
  records: ArenaCheckpoint[] | null,
  version = 11,
  samples: number[] = [0, 50, 100],
) =>
  fakeCtx({
    ghost: {
      raceTimeMs: cps.at(-1) ?? 0,
      checkpoints: cps.map((timeMs) => ({ timeMs, stuntsScore: null })),
      recordData: { version, uncompressedSize: 0, compressed: new Uint8Array(0) },
    },
    samples: samples.map((timeMs) => ({
      timeMs,
      position: [0, 0, 0],
      speedMs: 0,
      steer: 0,
      gas: false,
      brake: false,
      simCoef: 1,
      state: null,
    })),
    checkpointRecords: records,
  })

describe('checkpoint_records', () => {
  test('every split but the finish backed by a record is quiet', () => {
    const r = checkpointRecords(ctxWith([5318, 10425], [record(5318)]), null)
    expect(r.applicable).toBe(true)
    expect(r.fired).toBe(false)
    expect(r.evidence).toEqual(['1 of 1 splits backed, finish 10425 ms without a record'])
  })

  test('a split without a record fires and names it', () => {
    const r = checkpointRecords(ctxWith([48141, 48142], []), null)
    expect(r.fired).toBe(true)
    expect(r.value).toBe(1)
    expect(r.evidence).toEqual(['cp1 48141 ms has no record'])
  })

  test('records from other attempts do not help a missing split', () => {
    const r = checkpointRecords(ctxWith([5000, 9000, 12000], [record(5000), record(8999)]), null)
    expect(r.fired).toBe(true)
    expect(r.evidence).toEqual(['cp2 9000 ms has no record'])
  })

  test('not applicable below record data version 11, without records, or with one split', () => {
    expect(checkpointRecords(ctxWith([5318, 10425], [], 10), null).applicable).toBe(false)
    expect(checkpointRecords(ctxWith([5318, 10425], null), null).applicable).toBe(false)
    expect(checkpointRecords(ctxWith([10425], []), null).applicable).toBe(false)
  })
})
