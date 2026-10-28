import type { Sample } from '../model.ts'
import {
  TICK_MS,
  TRAJECTORY_EPS_M,
  TRAJECTORY_MAX_SPAN_MS,
  TRAJECTORY_MIN_WINDOW_MS,
  TRAJECTORY_SKIP_START_MS,
} from './constants.ts'
import { notApplicable } from './relative.ts'
import type { FileContext, SignalResult } from './types.ts'

// walks a sample series forward in time, linear interpolation between samples
function interpolator(samples: Sample[]): (t: number) => [number, number, number] {
  let i = 0
  return (t) => {
    while (i + 1 < samples.length - 1 && samples[i + 1]!.timeMs <= t) {
      i++
    }
    const a = samples[i]!
    const b = samples[Math.min(i + 1, samples.length - 1)]!
    const span = b.timeMs - a.timeMs
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.timeMs) / span)) : 0
    return [
      a.position[0] + (b.position[0] - a.position[0]) * f,
      a.position[1] + (b.position[1] - a.position[1]) * f,
      a.position[2] + (b.position[2] - a.position[2]) * f,
    ]
  }
}

// two runs on one map driving the same line at the same race time, longest stretch within eps
export function trajectoryOverlap(a: FileContext, b: FileContext): SignalResult {
  if (a.ghost.ghostUid && a.ghost.ghostUid === b.ghost.ghostUid) {
    return notApplicable(
      'trajectory_overlap',
      'relative',
      'same ghost uid, one recording saved twice',
    )
  }
  if (!a.samples || !b.samples || a.samples.length < 2 || b.samples.length < 2) {
    return notApplicable('trajectory_overlap', 'relative', 'needs position samples on both files')
  }
  const start = Math.max(a.samples[0]!.timeMs, b.samples[0]!.timeMs, TRAJECTORY_SKIP_START_MS)
  const end = Math.min(a.samples.at(-1)!.timeMs, b.samples.at(-1)!.timeMs)
  if (end <= start) {
    return notApplicable('trajectory_overlap', 'relative', 'no overlapping time range')
  }
  if (end - start > TRAJECTORY_MAX_SPAN_MS) {
    return notApplicable('trajectory_overlap', 'relative', 'time range too long to compare')
  }
  const posA = interpolator(a.samples)
  const posB = interpolator(b.samples)
  let run = 0
  let runStart = start
  let best = 0
  let bestStart = start
  for (let t = start; t <= end; t += TICK_MS) {
    const pa = posA(t)
    const pb = posB(t)
    const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])
    if (d < TRAJECTORY_EPS_M) {
      if (run === 0) {
        runStart = t
      }
      run++
      if (run > best) {
        best = run
        bestStart = runStart
      }
    } else {
      run = 0
    }
  }
  const value = best * TICK_MS
  return {
    id: 'trajectory_overlap',
    level: 'relative',
    applicable: true,
    fired: value >= TRAJECTORY_MIN_WINDOW_MS,
    value,
    unit: 'ms',
    evidence: [`longest overlap ${value} ms from ${bestStart} ms, within ${TRAJECTORY_EPS_M} m`],
    references: [],
  }
}
