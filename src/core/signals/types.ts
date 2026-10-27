import type { Ghost, InputEvent, ParsedFile, Sample } from '../model.ts'

export type SignalId =
  | 'wall_time_ratio'
  | 'ticks_vs_racetime'
  | 'same_tick_toggle'
  | 'steer_spikes_per_sec'
  | 'input_density'
  | 'steer_device'
  | 'steer_repetition'
  | 'trajectory_overlap'
  | 'checkpoint_split_match'
  | 'metadata'

// absolute: the engine makes it impossible, relative: outlier against a reference, info: context only
export type SignalLevel = 'absolute' | 'relative' | 'info'

export type Device = 'keyboard' | 'pad' | 'mixed' | 'unknown'

export interface Reference {
  source: '2021' | 'baseline'
  label: string
  low: number | null
  high: number | null
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
}

export interface FileContext {
  name: string
  parsed: ParsedFile
  ghost: Ghost
  events: InputEvent[]
  steer: Int8Array | null
  samples: Sample[] | null
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
  relativeOutside: SignalId[]
  needsHumanReview: boolean
}

export interface FileReport {
  name: string
  login: string
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
