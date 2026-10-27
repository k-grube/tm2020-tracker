import type { FileReport, Report, SignalResult } from '../core/signals/types.ts'

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
