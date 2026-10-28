import { trajectoryOverlap } from './trajectory-overlap.ts'
import { checkpointSplitMatch } from './checkpoint-split-match.ts'
import { splitCopy } from './split-copy.ts'
import type { FileContext, FileReport, LoginGroup, MapGroup, Report } from './types.ts'

function groupIndices(ctxs: FileContext[], key: (c: FileContext) => string): Map<string, number[]> {
  const out = new Map<string, number[]>()
  ctxs.forEach((c, i) => {
    const k = key(c)
    if (!k) {
      return
    }
    const list = out.get(k)
    if (list) {
      list.push(i)
    } else {
      out.set(k, [i])
    }
  })
  return out
}

// pairs by map: trajectory for every pair, split match within one login, split copy across logins.
// aggregates by login for wall time. groups need two files
export function buildGroups(ctxs: FileContext[], reports: FileReport[]): Report['groups'] {
  const byMap: MapGroup[] = []
  for (const [mapUid, idx] of groupIndices(ctxs, (c) => c.ghost.mapUid)) {
    if (idx.length < 2) {
      continue
    }
    const signals: MapGroup['signals'] = []
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const a = ctxs[idx[x]!]!
        const b = ctxs[idx[y]!]!
        const pair: [string, string] = [a.name, b.name]
        signals.push({ ...trajectoryOverlap(a, b), pair })
        if (a.ghost.login && a.ghost.login === b.ghost.login) {
          signals.push({ ...checkpointSplitMatch(a, b), pair })
        } else {
          signals.push({ ...splitCopy(a, b), pair })
        }
      }
    }
    byMap.push({ mapUid, files: idx.map((i) => ctxs[i]!.name), signals })
  }

  const byLogin: LoginGroup[] = []
  for (const [login, idx] of groupIndices(ctxs, (c) => c.ghost.login)) {
    if (idx.length < 2) {
      continue
    }
    const ratios = idx
      .map((i) => reports[i]?.signals.find((s) => s.id === 'wall_time_ratio')?.value ?? null)
      .filter((v): v is number => v !== null)
    byLogin.push({
      login,
      files: idx.map((i) => ctxs[i]!.name),
      wallTimeRatio:
        ratios.length > 0
          ? {
              n: ratios.length,
              mean: ratios.reduce((a, b) => a + b, 0) / ratios.length,
              min: Math.min(...ratios),
              max: Math.max(...ratios),
            }
          : null,
    })
  }
  return { byMap, byLogin }
}
