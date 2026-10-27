import type {
  Baseline,
  Detector,
  FileContext,
  FileReport,
  Report,
  SignalResult,
  Summary,
} from './types.ts'

import { wallTimeRatio } from './wall-time.ts'
import { ticksVsRaceTime } from './ticks-vs-racetime.ts'
import { metadata } from './metadata.ts'
import { sameTickToggle } from './same-tick-toggle.ts'
import { steerDevice } from './steer-device.ts'
import { inputDensity } from './input-density.ts'
import { steerSpikes } from './steer-spikes.ts'
import { steerRepetition } from './steer-repetition.ts'
import { notApplicable } from './relative.ts'
import { buildGroups } from './groups.ts'

export const DETECTORS: Detector[] = [
  wallTimeRatio,
  ticksVsRaceTime,
  sameTickToggle,
  steerSpikes,
  inputDensity,
  steerDevice,
  steerRepetition,
  metadata,
]

export function summarize(signals: SignalResult[]): Summary {
  const absoluteFired = signals.filter((s) => s.level === 'absolute' && s.fired).map((s) => s.id)
  const relativeOutside = signals.filter((s) => s.level === 'relative' && s.fired).map((s) => s.id)
  return {
    absoluteFired,
    relativeOutside,
    needsHumanReview: absoluteFired.length > 0 || relativeOutside.length >= 2,
  }
}

// multi-file signals only exist in groups, single-file reports list them as not applicable
const MULTI_FILE_PLACEHOLDERS: SignalResult[] = [
  notApplicable('trajectory_overlap', 'relative', 'needs two files on the same map'),
  notApplicable('checkpoint_split_match', 'info', 'needs two files on the same map from one login'),
]

export function analyzeFile(ctx: FileContext, baseline: Baseline | null): FileReport {
  const signals = [...DETECTORS.map((d) => d(ctx, baseline)), ...MULTI_FILE_PLACEHOLDERS]
  return {
    name: ctx.name,
    login: ctx.ghost.login,
    mapUid: ctx.ghost.mapUid,
    raceTimeMs: ctx.ghost.raceTimeMs,
    device: ctx.device,
    signals,
    summary: summarize(signals),
  }
}

export function analyzeFiles(ctxs: FileContext[], baseline: Baseline | null): Report {
  const files = ctxs.map((c) => analyzeFile(c, baseline))
  return {
    generatedAt: new Date().toISOString(),
    files,
    groups: buildGroups(ctxs, files),
  }
}
