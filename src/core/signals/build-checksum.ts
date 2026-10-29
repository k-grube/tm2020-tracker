import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

const hex = (n: number): string => `0x${n.toString(16)}`

// the validation chunk names the game build and its executable checksum. every build string in the
// corpus maps to one checksum, a known build with another checksum ran a modified executable
export const buildChecksum: Detector = (ctx, baseline) => {
  const v = ctx.ghost.validation
  if (!v) {
    return notApplicable('build_checksum', 'empirical', 'no validation chunk')
  }
  if (!baseline) {
    return notApplicable('build_checksum', 'empirical', 'needs a baseline with the builds seen')
  }
  const known = baseline.builds[v.exeVersion]
  const corpus = known
    ? `corpus ${hex(known.checksum)} in ${known.files} files`
    : 'not in the corpus'
  return {
    id: 'build_checksum',
    level: 'empirical',
    applicable: true,
    fired: known !== undefined && known.checksum !== v.exeChecksum,
    value: null,
    unit: '',
    evidence: [`build ${v.exeVersion}, checksum ${hex(v.exeChecksum)}, ${corpus}`],
    references: [],
  }
}
