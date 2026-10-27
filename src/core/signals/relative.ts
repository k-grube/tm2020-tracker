import { BASELINE_RANKS, TUKEY_K } from './constants.ts'
import type { Baseline, BaselineStat, Device, Reference, SignalId, SignalResult } from './types.ts'

export function baselineStat(
  baseline: Baseline | null,
  id: SignalId,
  device: Device,
): BaselineStat | null {
  return baseline?.signals[id]?.[device] ?? null
}

export function baselineReference(stat: BaselineStat, device: Device): Reference {
  return {
    source: 'baseline',
    label: `typical top records (ranks ${BASELINE_RANKS[0]}-${BASELINE_RANKS[1]}), ${device}, n=${stat.n}`,
    low: stat.q1,
    high: stat.q3,
  }
}

export function outsideFence(value: number, stat: BaselineStat): boolean {
  const iqr = stat.q3 - stat.q1
  return value < stat.q1 - TUKEY_K * iqr || value > stat.q3 + TUKEY_K * iqr
}

// relative signal: raw value next to references, fires only against a baseline
export function relativeResult(
  id: SignalId,
  value: number,
  unit: string,
  evidence: string[],
  baseline: Baseline | null,
  device: Device,
  extraReferences: Reference[] = [],
): SignalResult {
  const stat = baselineStat(baseline, id, device)
  return {
    id,
    level: 'relative',
    applicable: true,
    fired: stat ? outsideFence(value, stat) : false,
    value,
    unit,
    evidence,
    references: [...extraReferences, ...(stat ? [baselineReference(stat, device)] : [])],
  }
}

export function notApplicable(
  id: SignalId,
  level: SignalResult['level'],
  reason: string,
): SignalResult {
  return {
    id,
    level,
    applicable: false,
    fired: false,
    value: null,
    unit: '',
    evidence: [reason],
    references: [],
  }
}
