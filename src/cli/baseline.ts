import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { computeBaseline } from '../core/baseline.ts'
import { parseGbx } from '../core/parse.ts'
import { analyzeBytes, type InputFile } from '../core/pipeline.ts'
import type { Baseline } from '../core/signals/types.ts'
import { expandPaths } from './analyze.ts'
import type { FetchIndex } from './fetch.ts'
import { inflateNode } from './inflate.ts'
import { readFileBytes } from './io.ts'

// chunks a signal depends on, presence share tells whether the baseline can speak for that signal
const TRACKED_CHUNKS = {
  '0x0309201d': (g: Parameters<typeof presence>[0]) => g.inputs.length > 0,
  '0x0309202c': (g: Parameters<typeof presence>[0]) => g.wallTime?.source === '02C',
  '0x0309202d': (g: Parameters<typeof presence>[0]) =>
    g.validation !== null || g.wallTime?.source === '02D',
  '0x03092023': (g: Parameters<typeof presence>[0]) => g.rawChunks.has(0x03092023),
}

function presence(g: ReturnType<typeof parseGbx>['ghosts'][number]): Record<string, boolean> {
  return Object.fromEntries(Object.entries(TRACKED_CHUNKS).map(([id, has]) => [id, has(g)]))
}

export async function baselineCommand(
  dir: string,
  opts: { ranks: [number, number] },
): Promise<Baseline> {
  const indexPath = join(dir, 'index.json')
  const index: FetchIndex = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, 'utf8')) as FetchIndex)
    : {}
  const [lo, hi] = opts.ranks
  const paths = expandPaths([dir]).filter((p) => {
    const entry = index[basename(p)]
    return !entry || (entry.position >= lo && entry.position <= hi)
  })

  const files: InputFile[] = []
  const counts: Record<string, number> = Object.fromEntries(
    Object.keys(TRACKED_CHUNKS).map((id) => [id, 0]),
  )
  for (const p of paths) {
    const bytes = readFileBytes(p)
    try {
      const ghost = parseGbx(bytes).ghosts[0]
      if (!ghost) {
        continue
      }
      for (const [id, has] of Object.entries(presence(ghost))) {
        counts[id]! += has ? 1 : 0
      }
      files.push({ name: p, bytes })
    } catch {
      continue
    }
  }
  const report = await analyzeBytes(files, null, inflateNode)
  const chunkPresence = Object.fromEntries(
    Object.entries(counts).map(([id, n]) => [id, files.length ? n / files.length : 0]),
  )
  return computeBaseline(report.files, { ranks: opts.ranks, chunkPresence })
}
