import { TICK_MS } from './constants.ts'
import type { FileContext } from './types.ts'

export interface RaceWindow {
  startTick: number
  endTick: number
}

// ticks from race time zero (or the first vehicle state, whichever is later) to the finish, the
// countdown and the post-finish tail are outside
export function raceWindow(ctx: FileContext): RaceWindow | null {
  const input = ctx.ghost.inputs[0]
  const raceTimeMs = ctx.ghost.raceTimeMs
  if (!input || raceTimeMs === null || raceTimeMs <= 0) {
    return null
  }
  const offset = input.startOffsetMs ?? 0
  const startTick = Math.max(ctx.firstVehicleTick ?? 0, Math.round(-offset / TICK_MS), 0)
  const endTick = Math.round((raceTimeMs - offset) / TICK_MS)
  return endTick > startTick ? { startTick, endTick } : null
}
