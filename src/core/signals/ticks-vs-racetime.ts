import { TICK_MS, TICKS_TOLERANCE } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// decoded input ticks must reach the finish, manual replay saves keep ticks past it so only a shortfall fires
export const ticksVsRaceTime: Detector = (ctx) => {
  const input = ctx.ghost.inputs[0]
  const raceTimeMs = ctx.ghost.raceTimeMs
  if (!input) {
    return notApplicable('ticks_vs_racetime', 'absolute', 'no inputs')
  }
  if (raceTimeMs === null) {
    return notApplicable('ticks_vs_racetime', 'absolute', 'no race time')
  }
  const ticks = ctx.decodedTicks ?? input.ticks
  const offset = input.startOffsetMs ?? 0
  const recordedMs = ticks * TICK_MS + offset
  const value = recordedMs - raceTimeMs
  const fired = value < -TICKS_TOLERANCE * TICK_MS
  const evidence = [
    `${ticks} ticks x ${TICK_MS} ms + start offset ${offset} ms = ${recordedMs} ms, race ${raceTimeMs} ms`,
  ]
  if (ctx.decodedTicks !== null && ctx.decodedTicks !== input.ticks) {
    evidence.push(`decoded ${ctx.decodedTicks} of ${input.ticks} ticks, the data ends early`)
  }
  if (fired) {
    evidence.push(`inputs stop ${-value} ms before the finish`)
  }
  return {
    id: 'ticks_vs_racetime',
    level: 'absolute',
    applicable: true,
    fired,
    value,
    unit: 'ms',
    evidence,
    references: [],
    ...(fired
      ? {
          spans: [
            {
              startTick: ticks,
              endTick: Math.round((raceTimeMs - offset) / TICK_MS),
              label: 'no inputs',
            },
          ],
        }
      : {}),
  }
}
