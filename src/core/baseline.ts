import type { Baseline, BaselineStat, Device, FileReport, SignalId } from './signals/types.ts'

// relative signals get a reference range, everything else has none
const RELATIVE_IDS: SignalId[] = [
  'wall_time_delta',
  'steer_spikes_per_sec',
  'input_density',
  'steer_repetition',
]
const MIN_FILES_PER_DEVICE = 5

// linear interpolation between order statistics, sorted ascending input
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) {
    throw new Error('quantile of empty list')
  }
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  const f = pos - lo
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * f
}

function stat(values: number[]): BaselineStat {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
  }
}

export function computeBaseline(
  reports: FileReport[],
  meta: { ranks: [number, number]; chunkPresence: Record<string, number> },
): Baseline {
  const signals: Baseline['signals'] = {}
  for (const id of RELATIVE_IDS) {
    const byDevice = new Map<Device, number[]>()
    for (const r of reports) {
      const s = r.signals.find((x) => x.id === id)
      if (!s || !s.applicable || s.value === null) {
        continue
      }
      const list = byDevice.get(r.device) ?? []
      list.push(s.value)
      byDevice.set(r.device, list)
    }
    for (const [device, values] of byDevice) {
      if (values.length < MIN_FILES_PER_DEVICE) {
        continue
      }
      signals[id] = { ...(signals[id] ?? {}), [device]: stat(values) }
    }
  }
  return {
    builtAt: new Date().toISOString(),
    files: reports.length,
    ranks: meta.ranks,
    chunkPresence: meta.chunkPresence,
    signals,
  }
}
