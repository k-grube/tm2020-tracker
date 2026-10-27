import { notApplicable, relativeResult } from './relative.ts'
import type { Detector } from './types.ts'

// input events per race second, scripted low-input runs sit far below a human on the same track
export const inputDensity: Detector = (ctx, baseline) => {
  const raceTimeMs = ctx.ghost.raceTimeMs
  if (ctx.events.length === 0) {
    return notApplicable('input_density', 'relative', 'no inputs')
  }
  if (!raceTimeMs || raceTimeMs <= 0) {
    return notApplicable('input_density', 'relative', 'no race time')
  }
  const raceSec = raceTimeMs / 1000
  const steer = ctx.events.filter((e) => e.kind === 'steer').length
  const other = ctx.events.filter((e) => e.kind !== 'steer' && e.kind !== 'mouse').length
  return relativeResult(
    'input_density',
    ctx.events.length / raceSec,
    'events/s',
    [
      `steer ${(steer / raceSec).toFixed(2)} / s, other ${(other / raceSec).toFixed(2)} / s`,
      `${ctx.events.length} events over ${raceSec.toFixed(2)} s`,
    ],
    baseline,
    ctx.device,
  )
}
