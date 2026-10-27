import { WALL_TIME_RESOLUTION_S } from './constants.ts'
import { notApplicable, relativeResult } from './relative.ts'
import type { Detector } from './types.ts'

// real elapsed seconds over race seconds, slow-motion pushes it above 1 by a stable factor, lag does too
export const wallTimeRatio: Detector = (ctx, baseline) => {
  const { wallTime, raceTimeMs } = ctx.ghost
  if (!wallTime) {
    return notApplicable('wall_time_ratio', 'relative', 'no wall time chunk')
  }
  if (!raceTimeMs || raceTimeMs <= 0) {
    return notApplicable('wall_time_ratio', 'relative', 'no race time')
  }
  const wallSec = wallTime.endUnixSec - wallTime.startUnixSec
  const raceSec = raceTimeMs / 1000
  const ratio = wallSec / raceSec
  const uncertainty = WALL_TIME_RESOLUTION_S / raceSec
  return relativeResult(
    'wall_time_ratio',
    ratio,
    'ratio',
    [
      `wall ${wallSec} s (+-${WALL_TIME_RESOLUTION_S} s, chunk ${wallTime.source}), race ${raceSec.toFixed(3)} s`,
      `ratio ${ratio.toFixed(3)} +-${uncertainty.toFixed(3)} from the 1 s wall clock resolution`,
    ],
    baseline,
    ctx.device,
  )
}
