import { notApplicable } from './relative.ts'
import { sameRecording } from './same-recording.ts'
import type { FileContext, SignalResult } from './types.ts'

// identical checkpoint times to the millisecond across two runs by one player
export function checkpointSplitMatch(a: FileContext, b: FileContext): SignalResult {
  const ca = a.ghost.checkpoints
  const cb = b.ghost.checkpoints
  const same = sameRecording(a, b)
  if (same) {
    return notApplicable('checkpoint_split_match', 'info', same)
  }
  if (ca.length === 0 || cb.length === 0) {
    return notApplicable('checkpoint_split_match', 'info', 'needs checkpoints on both files')
  }
  const matches: string[] = []
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    if (ca[i]!.timeMs === cb[i]!.timeMs) {
      matches.push(`cp${i + 1} ${ca[i]!.timeMs} ms`)
    }
  }
  return {
    id: 'checkpoint_split_match',
    level: 'info',
    applicable: true,
    fired: false,
    value: matches.length,
    unit: 'checkpoints',
    evidence: [`${matches.length} of ${n} checkpoint times identical`, ...matches],
    references: [],
  }
}
