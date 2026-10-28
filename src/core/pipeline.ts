import { parseGbx } from './parse.ts'
import { buildContext } from './signals/context.ts'
import { analyzeFiles, errorReport } from './signals/index.ts'
import type { Inflate } from './model.ts'
import type { Baseline, FileContext, Report } from './signals/types.ts'

export interface InputFile {
  name: string
  bytes: Uint8Array
}

// same entry for the cli and the web page, a file that fails to parse becomes an error report
export async function analyzeBytes(
  files: InputFile[],
  baseline: Baseline | null,
  inflate: Inflate,
): Promise<Report> {
  const ctxs: (FileContext | null)[] = []
  const errors: string[] = []
  for (const f of files) {
    try {
      ctxs.push(await buildContext(f.name, parseGbx(f.bytes), inflate))
      errors.push('')
    } catch (e) {
      ctxs.push(null)
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  const good = ctxs.filter((c): c is FileContext => c !== null)
  const analyzed = analyzeFiles(good, baseline)
  let next = 0
  const reports = ctxs.map((c, i) =>
    c ? analyzed.files[next++]! : errorReport(files[i]!.name, errors[i]!),
  )
  return { ...analyzed, files: reports }
}
