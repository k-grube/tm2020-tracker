import type { Baseline, LeaderboardEntry, Report } from '../core/signals/types.ts'
import type { FileViz } from './viz.ts'

export interface AnalyzeRequest {
  type: 'analyze'
  files: { name: string; bytes: ArrayBuffer; leaderboard?: LeaderboardEntry }[]
  baseline: Baseline | null
}

export type WorkerResponse =
  { type: 'report'; report: Report; viz: (FileViz | null)[] } | { type: 'error'; message: string }
