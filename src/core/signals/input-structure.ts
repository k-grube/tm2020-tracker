import { FIRST_VEHICLE_MAX_TICK, INPUT_OTHER_KINDS } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// one contiguous vehicle block, every other kind in the allowed set
function validSequence(kinds: number[]): boolean {
  const blocks = kinds.filter((k, i) => k === 2 && kinds[i - 1] !== 2).length
  return blocks === 1 && kinds.every((k) => k === 2 || INPUT_OTHER_KINDS.includes(k))
}

// shape of the stream as the game writes it: one entry, one vehicle block, the vehicle state within
// the first ticks, steer never below -127
export const inputStructure: Detector = (ctx) => {
  const inputs = ctx.ghost.inputs
  if (inputs.length === 0) {
    return notApplicable('input_structure', 'empirical', 'no inputs')
  }
  const failed: string[] = []
  if (inputs.length !== 1) {
    failed.push(`${inputs.length} input entries`)
  }
  if (ctx.kinds.length > 0 && !validSequence(ctx.kinds)) {
    failed.push(`state sequence ${ctx.kinds.join(',')}`)
  }
  if (ctx.firstVehicleTick !== null && ctx.firstVehicleTick > FIRST_VEHICLE_MAX_TICK) {
    failed.push(`first vehicle state at tick ${ctx.firstVehicleTick}`)
  }
  if (ctx.minSteer !== null && ctx.minSteer < -127) {
    failed.push(`steer ${ctx.minSteer}`)
  }
  return {
    id: 'input_structure',
    level: 'empirical',
    applicable: true,
    fired: failed.length > 0,
    value: failed.length,
    unit: 'rules',
    evidence:
      failed.length > 0
        ? failed
        : [
            `states ${ctx.kinds.join(',') || '-'}, vehicle from tick ${ctx.firstVehicleTick ?? '-'}`,
          ],
    references: [],
  }
}
