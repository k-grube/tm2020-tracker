import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// a game-written stream always decodes, a stream that does not is either edited or a parser gap
export const decodeFailure: Detector = (ctx) => {
  if (ctx.ghost.inputs.length === 0 && ctx.ghost.recordData === null) {
    return notApplicable('decode_failure', 'absolute', 'no inputs or record data')
  }
  const errors = [ctx.inputError, ctx.samplesError].filter((e): e is string => e !== null)
  return {
    id: 'decode_failure',
    level: 'absolute',
    applicable: true,
    fired: errors.length > 0,
    value: errors.length,
    unit: 'errors',
    evidence: errors.length > 0 ? errors : ['inputs and record data decoded'],
    references: [],
  }
}
