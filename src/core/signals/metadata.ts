import { hex } from '../gbx/node.ts'
import type { Detector } from './types.ts'

function hexBytes(bytes: Uint8Array, n: number): string {
  return Array.from(bytes.subarray(0, n))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ')
}

export const metadata: Detector = (ctx) => {
  const g = ctx.ghost
  const evidence: string[] = [
    `login ${g.login}, nickname ${g.nickname}`,
    `zone ${g.zone ?? '-'}, club tag ${g.clubTag ?? '-'}, trigram ${g.trigram ?? '-'}`,
    `recording context ${g.recordingContext ?? '-'}, ghost version ${g.ghostVersion ?? '-'}`,
    `map ${g.mapUid}, model ${g.playerModel.id}, respawns ${g.respawns ?? '-'}`,
  ]
  if (ctx.parsed.replay) {
    const r = ctx.parsed.replay
    evidence.push(
      `replay header v${r.version}, nick ${r.nickname}, login ${r.login ?? '-'}, title ${r.titleId ?? '-'}`,
    )
  }
  if (g.validation) {
    const v = g.validation
    evidence.push(`exe ${v.exeVersion}, os ${v.osKind}, cpu ${v.cpuKind}, title ${v.titleId}`)
    evidence.push(`race settings ${v.raceSettings || '-'}, validation seed ${v.validationSeed}`)
  }
  for (const [id, bytes] of g.rawChunks) {
    evidence.push(`chunk ${hex(id)}: ${bytes.length} bytes, ${hexBytes(bytes, 16)}`)
  }
  if (g.unknownChunks.length > 0) {
    evidence.push(`unknown skippable chunks: ${g.unknownChunks.map(hex).join(' ')}`)
  }
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
