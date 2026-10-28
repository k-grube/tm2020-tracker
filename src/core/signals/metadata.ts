import type { Detector } from './types.ts'

export const metadata: Detector = (ctx) => {
  const g = ctx.ghost
  const evidence: string[] = [
    `login ${g.login}, nickname ${g.nickname}`,
    `zone ${g.zone ?? '-'}, club tag ${g.clubTag ?? '-'}, trigram ${g.trigram ?? '-'}`,
    `recording context ${g.recordingContext ?? '-'}, ghost version ${g.ghostVersion ?? '-'}`,
    `map ${g.mapUid}, model ${g.playerModel.id}, respawns ${g.respawns ?? '-'}`,
    `samples ${ctx.samples?.length ?? '-'}`,
  ]
  if (ctx.parsed.replay) {
    const r = ctx.parsed.replay
    evidence.push(
      `replay header v${r.version}, nick ${r.nickname}, login ${r.login ?? '-'}, title ${r.titleId ?? '-'}`,
    )
  }
  const ghosts = ctx.parsed.ghosts
  if (ghosts.length > 1) {
    evidence.push(`ghosts ${ghosts.length}, analyzed #${ghosts.indexOf(g) + 1}`)
    ghosts.forEach((x, i) => {
      evidence.push(`ghost #${i + 1} ${x.login} ${x.raceTimeMs ?? '-'} ms`)
    })
  }
  if (g.validation) {
    const v = g.validation
    evidence.push(
      `exe ${v.exeVersion}, os ${v.osKind}, cpu ${v.cpuKind}, title ${v.titleId || '-'}`,
    )
    evidence.push(
      `race settings ${v.raceSettings || '-'}, validation seed ${v.validationSeed}, chunk ${v.source}`,
    )
  }
  evidence.push(`recording id ${g.recordingId ?? '-'}`)
  for (const w of ctx.parsed.warnings) {
    evidence.push(`warning: ${w}`)
  }
  return {
    id: 'metadata',
    level: 'info',
    applicable: true,
    fired: false,
    value: null,
    unit: '',
    evidence,
    references: [],
  }
}
