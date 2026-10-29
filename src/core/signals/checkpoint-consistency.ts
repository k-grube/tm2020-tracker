import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// index of the first position where the two lists differ, null when equal
function firstDiff(a: number[], b: number[]): number | null {
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return i
    }
  }
  return null
}

// the game writes the split times three times (00B, 01B deltas, 02B) and the race time twice more,
// every copy agrees in every file it writes
export const checkpointConsistency: Detector = (ctx) => {
  const g = ctx.ghost
  const times = g.checkpoints.map((c) => c.timeMs)
  if (times.length === 0) {
    return notApplicable('checkpoint_consistency', 'absolute', 'no checkpoint times')
  }
  const failed: string[] = []
  times.forEach((t, i) => {
    if (t <= 0) {
      failed.push(`cp${i + 1} ${t} ms at or before the start`)
    }
  })
  for (let i = 1; i < times.length; i++) {
    if (times[i]! <= times[i - 1]!) {
      failed.push(`cp${i + 1} ${times[i]} ms not after cp${i} ${times[i - 1]} ms`)
    }
  }
  // the run spawns at the start landmark, 1123 legit records never spawn at a split's landmark
  if (g.checkpoints02b) {
    const spawn = g.checkpoints02b.spawnLandmark
    const at = g.checkpoints02b.entries.findIndex((e) => e.landmark === spawn)
    if (at >= 0) {
      const label = at === g.checkpoints02b.entries.length - 1 ? 'the finish' : `cp${at + 1}`
      failed.push(`spawn landmark ${spawn} is the landmark of ${label}`)
    }
  }
  const race = g.raceTimeMs
  if (race !== null && times.at(-1) !== race) {
    failed.push(`last checkpoint ${times.at(-1)} ms, race ${race} ms`)
  }
  if (g.checkpoints01b) {
    let sum = 0
    const cumulative = g.checkpoints01b.deltasMs.map((d) => (sum += d))
    const i = firstDiff(cumulative, times)
    if (i !== null) {
      failed.push(`01B cp${i + 1} ${cumulative[i] ?? '-'} ms, 00B ${times[i] ?? '-'} ms`)
    }
    if (race !== null && g.checkpoints01b.totalMs !== race) {
      failed.push(`01B total ${g.checkpoints01b.totalMs} ms, race ${race} ms`)
    }
  }
  if (g.checkpoints02b) {
    const listed = g.checkpoints02b.entries.map((e) => e.timeMs)
    const i = firstDiff(listed, times)
    if (i !== null) {
      failed.push(`02B cp${i + 1} ${listed[i] ?? '-'} ms, 00B ${times[i] ?? '-'} ms`)
    }
    if (race !== null && g.checkpoints02b.totalMs !== race) {
      failed.push(`02B total ${g.checkpoints02b.totalMs} ms, race ${race} ms`)
    }
  }
  return {
    id: 'checkpoint_consistency',
    level: 'absolute',
    applicable: true,
    fired: failed.length > 0,
    value: failed.length,
    unit: 'rules',
    evidence: failed.length > 0 ? failed : [`${times.length} checkpoints, copies agree`],
    references: [],
  }
}
