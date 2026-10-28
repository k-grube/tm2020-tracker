import type { Ghost, InputEvent, ParsedFile, Sample } from '../model.ts'

export const SIGNAL_IDS = [
  'decode_failure',
  'wall_time_ratio',
  'wall_time_delta',
  'ticks_vs_racetime',
  'validation_consistency',
  'checkpoint_consistency',
  'sample_input_match',
  'position_continuity',
  'input_structure',
  'same_tick_toggle',
  'steer_spikes_per_sec',
  'input_density',
  'steer_device',
  'steer_repetition',
  'trajectory_overlap',
  'checkpoint_split_match',
  'split_copy',
  'metadata',
] as const

export type SignalId = (typeof SIGNAL_IDS)[number]

// absolute: one file contradicts itself, empirical: fixed rule never seen in the legit corpus,
// relative: outlier against a reference, info: context only
export type SignalLevel = 'absolute' | 'empirical' | 'relative' | 'info'

export type Device = 'keyboard' | 'pad' | 'mixed' | 'unknown'

export interface Reference {
  source: '2021' | 'baseline'
  label: string
  low: number | null
  high: number | null
}

// a stretch of the run a signal points at, in input ticks
export interface Span {
  startTick: number
  endTick: number
  label: string
}

export interface SignalResult {
  id: SignalId
  level: SignalLevel
  applicable: boolean
  fired: boolean
  value: number | null
  unit: string
  evidence: string[]
  references: Reference[]
  spans?: Span[]
}

export interface FileContext {
  name: string
  parsed: ParsedFile
  ghost: Ghost
  events: InputEvent[]
  steer: Int8Array | null
  samples: Sample[] | null
  // ticks the input decoder actually read, null without decodable inputs
  decodedTicks: number | null
  // decoder messages, null when that stage decoded or had nothing to decode
  inputError: string | null
  samplesError: string | null
  // stream structure from the input decoder, empty or null without decodable inputs
  firstVehicleTick: number | null
  kinds: number[]
  minSteer: number | null
  device: Device
}

export interface BaselineStat {
  n: number
  median: number
  q1: number
  q3: number
}

export interface Baseline {
  builtAt: string
  files: number
  ranks: [number, number]
  chunkPresence: Record<string, number>
  signals: Partial<Record<SignalId, Partial<Record<Device, BaselineStat>>>>
}

export type Detector = (ctx: FileContext, baseline: Baseline | null) => SignalResult

export interface Summary {
  absoluteFired: SignalId[]
  empiricalFired: SignalId[]
  relativeOutside: SignalId[]
  needsHumanReview: boolean
}

export interface FileReport {
  name: string
  login: string
  nickname: string
  mapUid: string
  raceTimeMs: number | null
  device: Device
  signals: SignalResult[]
  summary: Summary
}

export interface MapGroup {
  mapUid: string
  files: string[]
  signals: (SignalResult & { pair: [string, string] })[]
}

export interface LoginGroup {
  login: string
  files: string[]
  wallTimeRatio: { n: number; mean: number; min: number; max: number } | null
}

export interface Report {
  generatedAt: string
  files: FileReport[]
  groups: { byMap: MapGroup[]; byLogin: LoginGroup[] }
}
