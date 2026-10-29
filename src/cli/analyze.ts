import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { analyzeBytes, type InputFile } from '../core/pipeline.ts'
import type { Baseline, LeaderboardEntry, Report } from '../core/signals/types.ts'
import type { FetchIndex } from './fetch.ts'
import { inflateNode } from './inflate.ts'
import { readFileBytes } from './io.ts'

// files as given, directories expand to their .gbx files one level deep
export function expandPaths(paths: string[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p).sort()) {
        if (/\.gbx$/i.test(name)) {
          out.push(join(p, name))
        }
      }
    } else {
      out.push(p)
    }
  }
  return out
}

// the index.json fetch writes next to the files names the leaderboard account behind each one
function leaderboardEntry(
  path: string,
  indexes: Map<string, FetchIndex>,
): LeaderboardEntry | undefined {
  const dir = dirname(path)
  let index = indexes.get(dir)
  if (!index) {
    const indexPath = join(dir, 'index.json')
    index = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, 'utf8')) as FetchIndex) : {}
    indexes.set(dir, index)
  }
  const entry = index[basename(path)]
  if (!entry?.accountId) {
    return undefined
  }
  return { accountId: entry.accountId, timestamp: entry.timestamp ?? null }
}

export async function analyzeCommand(paths: string[], baseline: Baseline | null): Promise<Report> {
  const indexes = new Map<string, FetchIndex>()
  const files: InputFile[] = expandPaths(paths).map((p) => {
    const leaderboard = leaderboardEntry(p, indexes)
    return { name: p, bytes: readFileBytes(p), ...(leaderboard ? { leaderboard } : {}) }
  })
  return analyzeBytes(files, baseline, inflateNode)
}
