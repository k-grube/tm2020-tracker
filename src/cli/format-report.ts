import {
  SIGNAL_IDS,
  type FileReport,
  type Report,
  type SignalResult,
} from '../core/signals/types.ts'

function fmtValue(s: SignalResult): string {
  if (s.value === null) {
    return '-'
  }
  const v = Number.isInteger(s.value) ? String(s.value) : s.value.toFixed(3)
  return s.unit ? `${v} ${s.unit}` : v
}

function status(s: SignalResult): string {
  if (!s.applicable) {
    return 'n/a'
  }
  return s.fired ? 'FIRED' : 'ok'
}

function fmtFile(f: FileReport): string[] {
  const lines = [
    `== ${f.name}`,
    `   login ${f.login || '-'}, map ${f.mapUid || '-'}, race ${f.raceTimeMs ?? '-'} ms, device ${f.device}`,
    `   needs human review: ${f.summary.needsHumanReview ? 'yes' : 'no'}` +
      (f.summary.absoluteFired.length ? `, absolute: ${f.summary.absoluteFired.join(' ')}` : '') +
      (f.summary.empiricalFired.length
        ? `, empirical: ${f.summary.empiricalFired.join(' ')}`
        : '') +
      (f.summary.relativeOutside.length
        ? `, outside reference: ${f.summary.relativeOutside.join(' ')}`
        : ''),
  ]
  for (const s of f.signals) {
    lines.push(
      `   ${s.id.padEnd(24)} ${s.level.padEnd(8)} ${fmtValue(s).padEnd(18)} ${status(s).padEnd(6)} ${s.evidence[0] ?? ''}`,
    )
    for (const r of s.references) {
      lines.push(`   ${''.padEnd(24)} ref: ${r.label}: ${r.low ?? ''}..${r.high ?? ''}`)
    }
  }
  return lines
}

export function formatReport(report: Report): string {
  const lines: string[] = []
  for (const f of report.files) {
    lines.push(...fmtFile(f), '')
  }
  for (const g of report.groups.byMap) {
    lines.push(`== map ${g.mapUid}: ${g.files.join(', ')}`)
    for (const s of g.signals) {
      lines.push(
        `   ${s.id.padEnd(24)} ${s.pair[0]} vs ${s.pair[1]}: ${fmtValue(s)} ${status(s)} ${s.evidence[0] ?? ''}`,
      )
    }
    lines.push('')
  }
  for (const g of report.groups.byLogin) {
    const w = g.wallTimeRatio
    lines.push(
      `== login ${g.login}: ${g.files.length} files, wall time ratio ${w ? `mean ${w.mean.toFixed(3)} (${w.min.toFixed(3)}..${w.max.toFixed(3)}, n=${w.n})` : 'n/a'}`,
    )
  }
  return lines.join('\n') + '\n'
}

// an error report carries one metadata line and nothing else
const isError = (f: FileReport): boolean => f.signals.length === 1 && !f.signals[0]!.applicable

// per signal: fired over applicable, fired file names below, pair signals counted over map groups
export function formatSummary(report: Report): string {
  const errors = report.files.filter(isError)
  const review = report.files.filter((f) => f.summary.needsHumanReview)
  const lines = [`files ${report.files.length}, errors ${errors.length}, review ${review.length}`]
  const pairs = report.groups.byMap.flatMap((g) => g.signals)
  for (const id of SIGNAL_IDS) {
    const perPair = pairs.filter((s) => s.id === id)
    if (perPair.length > 0) {
      const fired = perPair.filter((s) => s.fired)
      lines.push(`${id} pairs ${fired.length}/${perPair.filter((s) => s.applicable).length}`)
      for (const s of fired) {
        lines.push(`  ${s.pair[0]} vs ${s.pair[1]}`)
      }
      continue
    }
    const perFile = report.files
      .filter((f) => !isError(f))
      .map((f) => ({ name: f.name, s: f.signals.find((s) => s.id === id) }))
      .filter((x): x is { name: string; s: SignalResult } => x.s !== undefined)
    const level = perFile[0]?.s.level ?? '-'
    const applicable = perFile.filter((x) => x.s.applicable)
    const fired = applicable.filter((x) => x.s.fired)
    lines.push(`${id} ${level} ${fired.length}/${applicable.length}`)
    for (const x of fired) {
      lines.push(`  ${x.name}`)
    }
  }
  lines.push('review')
  for (const f of review) {
    lines.push(`  ${f.name}`)
  }
  lines.push('errors')
  for (const f of errors) {
    lines.push(`  ${f.signals[0]!.evidence[0] ?? f.name}`)
  }
  return lines.join('\n') + '\n'
}
