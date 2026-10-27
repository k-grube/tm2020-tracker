import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { analyzeBytes, type InputFile } from '../core/pipeline.ts'
import type { Baseline, Report } from '../core/signals/types.ts'
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

export async function analyzeCommand(paths: string[], baseline: Baseline | null): Promise<Report> {
  const files: InputFile[] = expandPaths(paths).map((p) => ({ name: p, bytes: readFileBytes(p) }))
  return analyzeBytes(files, baseline, inflateNode)
}
