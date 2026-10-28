import type { Sample } from '../model.ts'
import {
  TRAJECTORY_EPS_M,
  TRAJECTORY_MAX_SPAN_MS,
  TRAJECTORY_MIN_WINDOW_MS,
  TRAJECTORY_SHIFT_MS,
  TRAJECTORY_SKIP_START_MS,
  TRAJECTORY_STEP_MS,
} from './constants.ts'
import { notApplicable } from './relative.ts'
import { sameRecording } from './same-recording.ts'
import type { FileContext, SignalResult } from './types.ts'

type Vec3 = [number, number, number]

// positions on a fixed time grid from startMs, linear between samples
function grid(samples: Sample[], startMs: number, endMs: number): Vec3[] {
  const out: Vec3[] = []
  let i = 0
  for (let t = startMs; t <= endMs; t += TRAJECTORY_STEP_MS) {
    while (i + 1 < samples.length - 1 && samples[i + 1]!.timeMs <= t) {
      i++
    }
    const a = samples[i]!
    const b = samples[Math.min(i + 1, samples.length - 1)]!
    const span = b.timeMs - a.timeMs
    const f = span > 0 ? Math.min(1, Math.max(0, (t - a.timeMs) / span)) : 0
    out.push([
      a.position[0] + (b.position[0] - a.position[0]) * f,
      a.position[1] + (b.position[1] - a.position[1]) * f,
      a.position[2] + (b.position[2] - a.position[2]) * f,
    ])
  }
  return out
}

// two runs on one map driving the same line, longest stretch within eps at any time shift up to
// TRAJECTORY_SHIFT_MS either way, in TRAJECTORY_STEP_MS steps
export function trajectoryOverlap(a: FileContext, b: FileContext): SignalResult {
  const same = sameRecording(a, b)
  if (same) {
    return notApplicable('trajectory_overlap', 'empirical', same)
  }
  if (!a.samples || !b.samples || a.samples.length < 2 || b.samples.length < 2) {
    return notApplicable('trajectory_overlap', 'empirical', 'needs position samples on both files')
  }
  const start = Math.max(a.samples[0]!.timeMs, b.samples[0]!.timeMs, TRAJECTORY_SKIP_START_MS)
  const end = Math.min(a.samples.at(-1)!.timeMs, b.samples.at(-1)!.timeMs)
  if (end <= start) {
    return notApplicable('trajectory_overlap', 'empirical', 'no overlapping time range')
  }
  if (end - start > TRAJECTORY_MAX_SPAN_MS) {
    return notApplicable('trajectory_overlap', 'empirical', 'time range too long to compare')
  }
  // b is sampled wider than a by the shift range, so every shifted lookup stays on real samples
  const bStart = start - TRAJECTORY_SHIFT_MS
  const ga = grid(a.samples, start, end)
  const gb = grid(b.samples, bStart, end + TRAJECTORY_SHIFT_MS)
  const bFirst = b.samples[0]!.timeMs
  const bLast = b.samples.at(-1)!.timeMs
  const shiftSteps = Math.round(TRAJECTORY_SHIFT_MS / TRAJECTORY_STEP_MS)
  let best = 0
  let bestStart = start
  let bestShift = 0
  for (let k = -shiftSteps; k <= shiftSteps; k++) {
    let run = 0
    let runStart = 0
    for (let i = 0; i < ga.length; i++) {
      const tA = start + i * TRAJECTORY_STEP_MS
      const tB = tA + k * TRAJECTORY_STEP_MS
      const pb = gb[i + k + shiftSteps]
      if (!pb || tB < bFirst || tB > bLast) {
        run = 0
        continue
      }
      const pa = ga[i]!
      const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])
      if (d >= TRAJECTORY_EPS_M) {
        run = 0
        continue
      }
      if (run === 0) {
        runStart = tA
      }
      run++
      if (run > best) {
        best = run
        bestStart = runStart
        bestShift = k * TRAJECTORY_STEP_MS
      }
    }
  }
  const value = best * TRAJECTORY_STEP_MS
  return {
    id: 'trajectory_overlap',
    level: 'empirical',
    applicable: true,
    fired: value >= TRAJECTORY_MIN_WINDOW_MS,
    value,
    unit: 'ms',
    evidence: [
      `longest overlap ${value} ms from ${bestStart} ms, shift ${bestShift} ms, within ${TRAJECTORY_EPS_M} m`,
    ],
    references: [],
  }
}
