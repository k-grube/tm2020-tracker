import { FIRST_VEHICLE_MAX_TICK, INPUT_OTHER_KINDS, TICK_MS } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector, Span } from './types.ts'

// one contiguous vehicle block, every other kind in the allowed set
function validSequence(kinds: number[]): boolean {
  const blocks = kinds.filter((k, i) => k === 2 && kinds[i - 1] !== 2).length
  return blocks === 1 && kinds.every((k) => k === 2 || INPUT_OTHER_KINDS.includes(k))
}

// the state changes from the race start on, beginning with the state in effect at the start. the
// countdown can drop out of the vehicle state for a few ticks and come back. a stream that ends
// before the race start is judged whole
function raceStates(
  kinds: number[],
  kindTicks: number[],
  startTick: number,
  streamTicks: number,
): [number[], number[]] {
  if (startTick >= streamTicks) {
    return [kinds, kindTicks]
  }
  let first = 0
  for (let i = 0; i < kinds.length; i++) {
    if (kindTicks[i]! <= startTick) {
      first = i
    }
  }
  return [kinds.slice(first), kindTicks.slice(first)]
}

// the stretches between two vehicle blocks, where the stream left the car and came back
function breaks(kinds: number[], kindTicks: number[]): Span[] {
  const spans: Span[] = []
  for (let i = 1; i < kinds.length; i++) {
    if (kinds[i] === 2 || kinds[i - 1] !== 2) {
      continue
    }
    const next = kinds.indexOf(2, i)
    if (next === -1) {
      break
    }
    spans.push({ startTick: kindTicks[i]!, endTick: kindTicks[next]!, label: 'break' })
  }
  return spans
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
  const ticks = ctx.kindTicks.join(',') || '-'
  const startTick = Math.round(-(inputs[0]!.startOffsetMs ?? 0) / TICK_MS)
  const [raceKinds, raceTicks] = raceStates(ctx.kinds, ctx.kindTicks, startTick, inputs[0]!.ticks)
  if (raceKinds.length > 0 && !validSequence(raceKinds)) {
    failed.push(`state sequence ${ctx.kinds.join(',')} at ticks ${ticks}`)
  }
  if (ctx.firstVehicleTick !== null && ctx.firstVehicleTick > FIRST_VEHICLE_MAX_TICK) {
    failed.push(`first vehicle state at tick ${ctx.firstVehicleTick}`)
  }
  if (ctx.minSteer !== null && ctx.minSteer < -127) {
    failed.push(`steer ${ctx.minSteer}`)
  }
  const spans = breaks(raceKinds, raceTicks)
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
            `states ${ctx.kinds.join(',') || '-'} at ticks ${ticks}, vehicle from tick ${ctx.firstVehicleTick ?? '-'}`,
          ],
    references: [],
    ...(spans.length > 0 ? { spans } : {}),
  }
}
