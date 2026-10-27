import { TICK_MS, TICKS_TOLERANCE } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// recorded input ticks must reach the finish, manual replay saves keep ticks past it so only a shortfall fires
export const ticksVsRaceTime: Detector = (ctx) => {
  const input = ctx.ghost.inputs[0]
  const raceTimeMs = ctx.ghost.raceTimeMs
  if (!input) {
    return notApplicable('ticks_vs_racetime', 'absolute', 'no inputs')
  }
  if (raceTimeMs === null) {
    return notApplicable('ticks_vs_racetime', 'absolute', 'no race time')
  }
  const recordedMs = input.ticks * TICK_MS + (input.startOffsetMs ?? 0)
  const value = recordedMs - raceTimeMs
  const fired = value < -TICKS_TOLERANCE * TICK_MS
  return {
    id: 'ticks_vs_racetime',
    level: 'absolute',
    applicable: true,
    fired,
    value,
    unit: 'ms',
    evidence: [
      `${input.ticks} ticks x ${TICK_MS} ms + start offset ${input.startOffsetMs ?? 0} ms = ${recordedMs} ms, race ${raceTimeMs} ms`,
      fired
        ? `inputs stop ${-value} ms before the finish`
        : `inputs cover the finish (${value >= 0 ? '+' : ''}${value} ms)`,
    ],
    references: [],
  }
}
