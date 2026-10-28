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
  const mouse = ctx.events.filter((e) => e.kind === 'mouse').length
  const other = ctx.events.length - steer - mouse
  // cursor movement is recorded in the stream but drives nothing
  return relativeResult(
    'input_density',
    (steer + other) / raceSec,
    'events/s',
    [
      `steer ${(steer / raceSec).toFixed(2)} / s, other ${(other / raceSec).toFixed(2)} / s, mouse ${(mouse / raceSec).toFixed(2)} / s`,
      `${steer + other} events over ${raceSec.toFixed(2)} s`,
    ],
    baseline,
    ctx.device,
  )
}
