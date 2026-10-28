import type { Validation } from '../model.ts'
import { UNSET_U32, VALIDATION_SEED_ZERO_MIN_BUILD, WALL_TIME_RESOLUTION_S } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// exe strings carry date=YYYY-MM-DD_HH_MM, read as utc
export function buildUnixSec(exeVersion: string): number | null {
  const m = /date=(\d{4})-(\d{2})-(\d{2})_(\d{2})_(\d{2})/.exec(exeVersion)
  if (!m) {
    return null
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) / 1000
}

const day = (unixSec: number): string => new Date(unixSec * 1000).toISOString().slice(0, 10)

const FIELDS: { key: keyof Validation; label: string }[] = [
  { key: 'exeVersion', label: 'exe' },
  { key: 'exeChecksum', label: 'checksum' },
  { key: 'osKind', label: 'os' },
  { key: 'cpuKind', label: 'cpu' },
  { key: 'raceSettings', label: 'settings' },
  { key: 'validationSeed', label: 'seed' },
]

// both validation copies, both recording windows, the build date and the seed agree in every legit file
export const validationConsistency: Detector = (ctx) => {
  const { validation: v, validation025: copy, wallTime: w, raceTimeMs } = ctx.ghost
  if (!v && !w) {
    return notApplicable('validation_consistency', 'empirical', 'no validation or wall time chunk')
  }
  const failed: string[] = []
  if (v && v.source === '02D' && copy) {
    const diff = FIELDS.filter((f) => v[f.key] !== copy[f.key])
    if (diff.length > 0) {
      const detail = diff.map((f) => `${f.label} ${copy[f.key]} vs ${v[f.key]}`).join(', ')
      failed.push(`025 differs from 02D: ${detail}`)
    }
  }
  const build = v ? buildUnixSec(v.exeVersion) : null
  if (w) {
    if (
      w.source === '02C' &&
      v?.startUnixSec != null &&
      v.endUnixSec != null &&
      (w.startUnixSec !== v.startUnixSec || w.endUnixSec !== v.endUnixSec)
    ) {
      failed.push(
        `02C window ${w.startUnixSec}..${w.endUnixSec} differs from 02D ${v.startUnixSec}..${v.endUnixSec}`,
      )
    }
    if (w.endUnixSec === UNSET_U32) {
      failed.push(`wall end ${w.endUnixSec} unset`)
    } else if (w.endUnixSec < w.startUnixSec) {
      failed.push(`wall end ${w.endUnixSec} before start ${w.startUnixSec}`)
    } else if (
      raceTimeMs !== null &&
      raceTimeMs > 0 &&
      w.endUnixSec - w.startUnixSec < raceTimeMs / 1000 - WALL_TIME_RESOLUTION_S
    ) {
      const wall = w.endUnixSec - w.startUnixSec
      failed.push(`wall ${wall} s shorter than race ${(raceTimeMs / 1000).toFixed(3)} s`)
    }
    if (build !== null && w.startUnixSec < build) {
      failed.push(
        `wall start ${w.startUnixSec} (${day(w.startUnixSec)}) before build ${day(build)}`,
      )
    }
  }
  // the seed is set when a record is validated online, local replay saves can carry 0 on any build
  if (
    ctx.parsed.kind === 'ghost' &&
    v &&
    v.validationSeed === 0 &&
    build !== null &&
    build >= VALIDATION_SEED_ZERO_MIN_BUILD
  ) {
    failed.push(`seed 0 on build ${day(build)}`)
  }
  return {
    id: 'validation_consistency',
    level: 'empirical',
    applicable: true,
    fired: failed.length > 0,
    value: failed.length,
    unit: 'rules',
    evidence: failed.length > 0 ? failed : ['no mismatch'],
    references: [],
  }
}
