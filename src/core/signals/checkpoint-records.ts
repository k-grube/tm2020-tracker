import { CHECKPOINT_RECORDS_MIN_VERSION } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// the arena player writes a checkpoint record at the exact ms of every split it drives through,
// the finish one is missing when the recording stops on the finish tick. version 11 record data
// backs every other split in every legit record, version 10 builds write no records at all
export const checkpointRecords: Detector = (ctx) => {
  const records = ctx.checkpointRecords
  if (records === null) {
    return notApplicable('checkpoint_records', 'empirical', 'needs record data')
  }
  const version = ctx.ghost.recordData?.version ?? 0
  if (version < CHECKPOINT_RECORDS_MIN_VERSION) {
    return notApplicable('checkpoint_records', 'empirical', `record data version ${version}`)
  }
  const splits = ctx.ghost.checkpoints.map((c) => c.timeMs)
  if (splits.length < 2) {
    return notApplicable('checkpoint_records', 'empirical', 'fewer than two splits')
  }
  const times = new Set(records.map((r) => r.timeMs))
  const finish = splits.at(-1)!
  const missing = splits
    .slice(0, -1)
    .map((t, i) => ({ index: i + 1, timeMs: t }))
    .filter((s) => !times.has(s.timeMs))
  return {
    id: 'checkpoint_records',
    level: 'empirical',
    applicable: true,
    fired: missing.length > 0,
    value: missing.length,
    unit: 'splits',
    evidence:
      missing.length > 0
        ? missing.map((s) => `cp${s.index} ${s.timeMs} ms has no record`)
        : [
            `${splits.length - 1} of ${splits.length - 1} splits backed, finish ${finish} ms ${times.has(finish) ? 'with' : 'without'} a record`,
          ],
    references: [],
  }
}
