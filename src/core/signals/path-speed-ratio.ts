import {
  CONTINUITY_EXCLUDE_MS,
  CONTINUITY_SLACK_M,
  CONTINUITY_SPEED_FACTOR,
  PATH_SPEED_MAX_RATIO,
  PATH_SPEED_MIN_PAIRS,
} from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

interface Pair {
  moved: number
  allowed: number
}

// distance the positions cover over the distance the recorded speed allows, summed over the race.
// position and speed come from different parts of the engine, a retimed or injected position
// stream drifts from 1. the sim time coefficient scales the allowed distance so a map's slow-motion
// stretch stays at 1. the declared respawns exempt that many of the largest jumps from both sums
export const pathSpeedRatio: Detector = (ctx) => {
  const samples = ctx.samples
  const race = ctx.ghost.raceTimeMs
  if (!samples || samples.length < 2) {
    return notApplicable('path_speed_ratio', 'empirical', 'needs position samples')
  }
  if (race === null || race <= 0) {
    return notApplicable('path_speed_ratio', 'empirical', 'no race time')
  }
  const respawns = Math.max(ctx.ghost.respawns ?? 0, 0)
  const pairs: Pair[] = []
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!
    const b = samples[i]!
    const dt = (b.timeMs - a.timeMs) / 1000
    if (dt <= 0 || a.timeMs < 0 || b.timeMs > race - CONTINUITY_EXCLUDE_MS) {
      continue
    }
    const moved = Math.hypot(
      b.position[0] - a.position[0],
      b.position[1] - a.position[1],
      b.position[2] - a.position[2],
    )
    pairs.push({ moved, allowed: Math.max(a.speedMs, b.speedMs) * dt * a.simCoef })
  }
  if (pairs.length < PATH_SPEED_MIN_PAIRS) {
    return notApplicable(
      'path_speed_ratio',
      'empirical',
      `needs ${PATH_SPEED_MIN_PAIRS} sample pairs inside the race`,
    )
  }
  const jumps = pairs
    .filter((p) => p.moved / (p.allowed + CONTINUITY_SLACK_M) > CONTINUITY_SPEED_FACTOR)
    .sort((x, y) => y.moved - x.moved)
  const exempt = new Set(jumps.slice(0, respawns))
  let path = 0
  let allowed = 0
  for (const p of pairs) {
    if (exempt.has(p)) {
      continue
    }
    path += p.moved
    allowed += p.allowed
  }
  if (allowed <= 0) {
    return notApplicable('path_speed_ratio', 'empirical', 'no recorded speed inside the race')
  }
  const ratio = path / allowed
  return {
    id: 'path_speed_ratio',
    level: 'empirical',
    applicable: true,
    fired: ratio > PATH_SPEED_MAX_RATIO,
    value: ratio,
    unit: 'ratio',
    evidence: [
      `path ${path.toFixed(0)} m, speed allows ${allowed.toFixed(0)} m, ratio ${ratio.toFixed(2)}`,
      `${jumps.length} jumps, ${exempt.size} exempt for ${respawns} respawns`,
    ],
    references: [],
  }
}
