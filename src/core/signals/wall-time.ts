import { WALL_TIME_RESOLUTION_S } from './constants.ts'
import { notApplicable, relativeResult } from './relative.ts'
import type { Detector, SignalId, SignalResult } from './types.ts'

function wallAndRace(
  ctx: Parameters<Detector>[0],
  id: SignalId,
): SignalResult | [number, number, string] {
  const { wallTime, raceTimeMs } = ctx.ghost
  if (!wallTime) {
    return notApplicable(id, 'relative', 'no wall time chunk')
  }
  if (!raceTimeMs || raceTimeMs <= 0) {
    return notApplicable(id, 'relative', 'no race time')
  }
  return [wallTime.endUnixSec - wallTime.startUnixSec, raceTimeMs / 1000, wallTime.source]
}

// real elapsed seconds over race seconds, the per-login aggregate reads this, a slow-motion factor is
// stable across a player's files. the fence lives on wall_time_delta, the ratio band scales with 1/race
export const wallTimeRatio: Detector = (ctx, baseline) => {
  const w = wallAndRace(ctx, 'wall_time_ratio')
  if (!Array.isArray(w)) {
    return { ...w, level: 'info' }
  }
  const [wallSec, raceSec, source] = w
  const ratio = wallSec / raceSec
  const uncertainty = WALL_TIME_RESOLUTION_S / raceSec
  const r = relativeResult(
    'wall_time_ratio',
    ratio,
    'ratio',
    [
      `wall ${wallSec} s (+-${WALL_TIME_RESOLUTION_S} s, chunk ${source}), race ${raceSec.toFixed(3)} s`,
      `ratio ${ratio.toFixed(3)} +-${uncertainty.toFixed(3)} from the 1 s wall clock resolution`,
    ],
    baseline,
    ctx.device,
  )
  return { ...r, level: 'info', fired: false }
}

// wall seconds minus race seconds, legit records sit about 0.2 to 2.2 s above zero on any map length
export const wallTimeDelta: Detector = (ctx, baseline) => {
  const w = wallAndRace(ctx, 'wall_time_delta')
  if (!Array.isArray(w)) {
    return w
  }
  const [wallSec, raceSec, source] = w
  const delta = wallSec - raceSec
  return relativeResult(
    'wall_time_delta',
    delta,
    's',
    [
      `wall ${wallSec} s (+-${WALL_TIME_RESOLUTION_S} s, chunk ${source}) minus race ${raceSec.toFixed(3)} s`,
      `slow motion at speed s adds race x (1/s - 1) seconds, lag adds a few`,
    ],
    baseline,
    ctx.device,
    [],
    true,
  )
}
