import { SPLIT_COPY_MIN_MATCHES } from './constants.ts'
import { notApplicable } from './relative.ts'
import { sameRecording, sharedRecording } from './same-recording.ts'
import type { FileContext, SignalResult } from './types.ts'

// two players, same map: one recording under both logins, or split times identical to the
// millisecond at the same checkpoint index
export function splitCopy(a: FileContext, b: FileContext): SignalResult {
  const same = sameRecording(a, b)
  if (same) {
    return notApplicable('split_copy', 'empirical', same)
  }
  const ca = a.ghost.checkpoints
  const cb = b.ghost.checkpoints
  if (ca.length === 0 || cb.length === 0) {
    return notApplicable('split_copy', 'empirical', 'needs checkpoints on both files')
  }
  const matches: string[] = []
  const n = Math.min(ca.length, cb.length)
  for (let i = 0; i < n; i++) {
    if (ca[i]!.timeMs === cb[i]!.timeMs) {
      matches.push(`cp${i + 1} ${ca[i]!.timeMs} ms`)
    }
  }
  const shared = sharedRecording(a, b)
  return {
    id: 'split_copy',
    level: 'empirical',
    applicable: true,
    fired: shared !== null || matches.length >= SPLIT_COPY_MIN_MATCHES,
    value: matches.length,
    unit: 'checkpoints',
    evidence: [
      ...(shared ? [`${shared} across logins`] : []),
      `${matches.length} of ${n} checkpoint times identical`,
      ...matches,
    ],
    references: [],
  }
}
