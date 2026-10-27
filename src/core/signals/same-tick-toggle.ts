import { SAME_TICK_MAX_GAP_TICKS, SAME_TICK_MIN_COUNT, TICK_MS } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'
import type { InputEvent } from '../model.ts'

const BINARY_KINDS = new Set<InputEvent['kind']>(['gas', 'brake', 'horn', 'jump', 'freeLook'])
const MAX_LISTED = 10

function keyAndState(e: InputEvent): { key: string; pressed: boolean } | null {
  if (e.kind === 'actionSlot') {
    return { key: `actionSlot ${e.value}`, pressed: e.value2 === 1 }
  }
  if (BINARY_KINDS.has(e.kind)) {
    return { key: e.kind, pressed: e.value === 1 }
  }
  return null
}

// a key pressed and released within one tick, scripted input playback does this, a hand does not
export const sameTickToggle: Detector = (ctx) => {
  if (ctx.events.length === 0) {
    return notApplicable('same_tick_toggle', 'absolute', 'no inputs')
  }
  const pressTick = new Map<string, number>()
  let count = 0
  const listed: string[] = []
  for (const e of ctx.events) {
    const ks = keyAndState(e)
    if (!ks) {
      continue
    }
    if (ks.pressed) {
      pressTick.set(ks.key, e.tick)
      continue
    }
    const pressed = pressTick.get(ks.key)
    pressTick.delete(ks.key)
    if (pressed !== undefined && e.tick - pressed <= SAME_TICK_MAX_GAP_TICKS) {
      count++
      if (listed.length < MAX_LISTED) {
        listed.push(`t=${pressed * TICK_MS} ms ${ks.key} held ${(e.tick - pressed) * TICK_MS} ms`)
      }
    }
  }
  return {
    id: 'same_tick_toggle',
    level: 'absolute',
    applicable: true,
    fired: count >= SAME_TICK_MIN_COUNT,
    value: count,
    unit: 'toggles',
    evidence: [
      `${count} press+release pairs within ${SAME_TICK_MAX_GAP_TICKS} tick (${SAME_TICK_MAX_GAP_TICKS * TICK_MS} ms), fires at ${SAME_TICK_MIN_COUNT}`,
      ...listed,
    ],
    references: [],
  }
}
