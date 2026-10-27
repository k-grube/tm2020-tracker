import { REF_2021, SPIKE_WINDOW_MS, STEER_SPIKE_MIN_DELTA, TICK_MS } from './constants.ts'
import { notApplicable, relativeResult } from './relative.ts'
import type { Detector, Reference } from './types.ts'

const REFERENCES: Reference[] = [
  {
    source: '2021',
    label: '2021 TMX investigation, leaderboard average spikes/s',
    low: null,
    high: REF_2021.avgSpikesPerSec,
  },
  {
    source: '2021',
    label: '2021 TMX investigation, average of per-replay max spikes/s',
    low: null,
    high: REF_2021.avgMaxSpikesPerSec,
  },
]

// the 2021 metric: steer direction changes per second, ignoring tiny deltas
export const steerSpikes: Detector = (ctx, baseline) => {
  const steer = ctx.steer
  if (!steer || steer.length < 2) {
    return notApplicable('steer_spikes_per_sec', 'relative', 'no steer series')
  }
  const windowTicks = SPIKE_WINDOW_MS / TICK_MS
  const windows = new Array<number>(Math.ceil(steer.length / windowTicks)).fill(0)
  let prevSign = 0
  for (let t = 1; t < steer.length; t++) {
    const d = steer[t]! - steer[t - 1]!
    if (Math.abs(d) < STEER_SPIKE_MIN_DELTA) {
      continue
    }
    const sign = d > 0 ? 1 : -1
    if (prevSign !== 0 && sign !== prevSign) {
      windows[Math.floor(t / windowTicks)]!++
    }
    prevSign = sign
  }
  const total = windows.reduce((a, b) => a + b, 0)
  const avg = total / windows.length
  const max = Math.max(...windows)
  return relativeResult(
    'steer_spikes_per_sec',
    avg,
    'spikes/s',
    [`avg ${avg.toFixed(2)} spikes/s over ${windows.length} windows, max window: ${max}`],
    baseline,
    ctx.device,
    REFERENCES,
  )
}
