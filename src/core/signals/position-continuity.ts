import {
  CONTINUITY_EXCLUDE_MS,
  CONTINUITY_SETTLE_MS,
  CONTINUITY_SLACK_M,
  CONTINUITY_SPEED_FACTOR,
  TICK_MS,
} from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector, Span } from './types.ts'

const MAX_SPANS = 200

// between two samples the car moves at most its recorded speed times the gap. a respawn teleports,
// the ghost declares how many it had, every teleport beyond that count is a seam or an edit. the
// second after a teleport and the last 200 ms before the finish are not measured
export const positionContinuity: Detector = (ctx) => {
  const samples = ctx.samples
  const race = ctx.ghost.raceTimeMs
  if (!samples || samples.length < 2) {
    return notApplicable('position_continuity', 'empirical', 'needs position samples')
  }
  if (race === null || race <= 0) {
    return notApplicable('position_continuity', 'empirical', 'no race time')
  }
  const respawns = Math.max(ctx.ghost.respawns ?? 0, 0)
  const offset = ctx.ghost.inputs[0]?.startOffsetMs ?? 0
  const tick = (t: number): number => Math.round((t - offset) / TICK_MS)
  const jumps: string[] = []
  const spans: Span[] = []
  let settleUntil = -Infinity
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const dt = (b.timeMs - a.timeMs) / 1000
    if (dt <= 0 || b.timeMs > race - CONTINUITY_EXCLUDE_MS || b.timeMs <= settleUntil) {
      continue
    }
    const moved = Math.hypot(
      b.position[0] - a.position[0],
      b.position[1] - a.position[1],
      b.position[2] - a.position[2],
    )
    const limit = Math.max(a.speedMs, b.speedMs) * dt + CONTINUITY_SLACK_M
    if (moved / limit <= CONTINUITY_SPEED_FACTOR) {
      continue
    }
    settleUntil = b.timeMs + CONTINUITY_SETTLE_MS
    jumps.push(`${b.timeMs} ms, ${moved.toFixed(2)} m moved, limit ${limit.toFixed(2)} m`)
    if (spans.length < MAX_SPANS) {
      spans.push({ startTick: tick(a.timeMs), endTick: tick(b.timeMs) + 1, label: 'jump' })
    }
  }
  return {
    id: 'position_continuity',
    level: 'empirical',
    applicable: true,
    fired: jumps.length > respawns,
    value: jumps.length,
    unit: 'jumps',
    evidence: [`${jumps.length} jumps, ${respawns} respawns declared`, ...jumps],
    references: [],
    ...(spans.length > 0 ? { spans } : {}),
  }
}
