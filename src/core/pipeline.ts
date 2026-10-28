import { parseHeader } from './gbx/header.ts'
import { parseGbx } from './parse.ts'
import { buildContext } from './signals/context.ts'
import { analyzeFiles, errorReport } from './signals/index.ts'
import type { Inflate } from './model.ts'
import type { Baseline, FileContext, Report } from './signals/types.ts'

export interface InputFile {
  name: string
  bytes: Uint8Array
}

// same entry for the cli and the web page. a file whose header fails is not a gbx file and gets an
// error report, a gbx file whose body or decode fails gets an error report that needs review
export async function analyzeBytes(
  files: InputFile[],
  baseline: Baseline | null,
  inflate: Inflate,
): Promise<Report> {
  const ctxs: (FileContext | null)[] = []
  const errors: { message: string; review: boolean }[] = []
  for (const f of files) {
    let review = false
    try {
      parseHeader(f.bytes)
      review = true
      ctxs.push(await buildContext(f.name, parseGbx(f.bytes), inflate))
      errors.push({ message: '', review: false })
    } catch (e) {
      ctxs.push(null)
      errors.push({ message: e instanceof Error ? e.message : String(e), review })
    }
  }
  const good = ctxs.filter((c): c is FileContext => c !== null)
  const analyzed = analyzeFiles(good, baseline)
  let next = 0
  const reports = ctxs.map((c, i) =>
    c
      ? analyzed.files[next++]!
      : errorReport(files[i]!.name, errors[i]!.message, errors[i]!.review),
  )
  return { ...analyzed, files: reports }
}
