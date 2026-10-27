import { parseGbx } from './parse.ts'
import { buildContext } from './signals/context.ts'
import { analyzeFiles } from './signals/index.ts'
import type { Inflate } from './model.ts'
import type { Baseline, FileContext, FileReport, Report } from './signals/types.ts'

export interface InputFile {
  name: string
  bytes: Uint8Array
}

function errorReport(name: string, message: string): FileReport {
  return {
    name,
    login: '',
    mapUid: '',
    raceTimeMs: null,
    device: 'unknown',
    signals: [
      {
        id: 'metadata',
        level: 'info',
        applicable: false,
        fired: false,
        value: null,
        unit: '',
        evidence: [`${name}: ${message}`],
        references: [],
      },
    ],
    summary: { absoluteFired: [], relativeOutside: [], needsHumanReview: false },
  }
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
