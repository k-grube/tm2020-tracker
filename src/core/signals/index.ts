import type {
  Baseline,
  Detector,
  FileContext,
  FileReport,
  Report,
  SignalResult,
  Summary,
} from './types.ts'

import { decodeFailure } from './decode-failure.ts'
import { wallTimeDelta, wallTimeRatio } from './wall-time.ts'
import { ticksVsRaceTime } from './ticks-vs-racetime.ts'
import { validationConsistency } from './validation-consistency.ts'
import { checkpointConsistency } from './checkpoint-consistency.ts'
import { sampleInputMatch } from './sample-input-match.ts'
import { positionContinuity } from './position-continuity.ts'
import { inputStructure } from './input-structure.ts'
import { metadata } from './metadata.ts'
import { sameTickToggle } from './same-tick-toggle.ts'
import { steerDevice } from './steer-device.ts'
import { inputDensity } from './input-density.ts'
import { steerSpikes } from './steer-spikes.ts'
import { steerRepetition } from './steer-repetition.ts'
import { notApplicable } from './relative.ts'
import { buildGroups } from './groups.ts'

export const DETECTORS: Detector[] = [
  decodeFailure,
  wallTimeRatio,
  wallTimeDelta,
  ticksVsRaceTime,
  validationConsistency,
  checkpointConsistency,
  sampleInputMatch,
  positionContinuity,
  inputStructure,
  sameTickToggle,
  steerSpikes,
  inputDensity,
  steerDevice,
  steerRepetition,
  metadata,
]

export function summarize(signals: SignalResult[]): Summary {
  const fired = (level: SignalResult['level']) =>
    signals.filter((s) => s.level === level && s.fired).map((s) => s.id)
  const absoluteFired = fired('absolute')
  const empiricalFired = fired('empirical')
  const relativeOutside = fired('relative')
  return {
    absoluteFired,
    empiricalFired,
    relativeOutside,
    needsHumanReview:
      absoluteFired.length > 0 || empiricalFired.length > 0 || relativeOutside.length >= 2,
  }
}

// multi-file signals only exist in groups, single-file reports list them as not applicable
const MULTI_FILE_PLACEHOLDERS: SignalResult[] = [
  notApplicable('trajectory_overlap', 'empirical', 'needs two files on the same map'),
  notApplicable('checkpoint_split_match', 'info', 'needs two files on the same map from one login'),
  notApplicable('split_copy', 'empirical', 'needs two files on the same map from two logins'),
]

// a file that could not be parsed or analyzed, one metadata line carries the message
export function errorReport(name: string, message: string, needsHumanReview: boolean): FileReport {
  return {
    name,
    login: '',
    nickname: '',
    mapUid: '',
    raceTimeMs: null,
    device: 'unknown',
    signals: [
      {
        id: 'metadata',
        level: 'info',
        applicable: false,
        fired: false,
        value: null,
        unit: '',
        evidence: [`${name}: ${message}`],
        references: [],
      },
    ],
    summary: {
      absoluteFired: [],
      empiricalFired: [],
      relativeOutside: [],
      needsHumanReview,
    },
  }
}

export function analyzeFile(ctx: FileContext, baseline: Baseline | null): FileReport {
  const signals = [...DETECTORS.map((d) => d(ctx, baseline)), ...MULTI_FILE_PLACEHOLDERS]
  return {
    name: ctx.name,
    login: ctx.ghost.login,
    nickname: ctx.ghost.nickname,
    mapUid: ctx.ghost.mapUid,
    raceTimeMs: ctx.ghost.raceTimeMs,
    device: ctx.device,
    signals,
    summary: summarize(signals),
  }
}

// a detector failure on one file never takes the batch down, that file becomes an error report
export function analyzeFiles(ctxs: FileContext[], baseline: Baseline | null): Report {
  const files: FileReport[] = []
  const okCtxs: FileContext[] = []
  const okReports: FileReport[] = []
  for (const ctx of ctxs) {
    try {
      const report = analyzeFile(ctx, baseline)
      files.push(report)
      okCtxs.push(ctx)
      okReports.push(report)
    } catch (e) {
      files.push(errorReport(ctx.name, e instanceof Error ? e.message : String(e), true))
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    files,
    groups: buildGroups(okCtxs, okReports),
  }
}
