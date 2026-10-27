import { decodeInputs, steerSeries } from '../inputs/decode.ts'
import { decodeSamples } from '../samples/decode.ts'
import type { Inflate, ParsedFile } from '../model.ts'
import { KEYBOARD_STEER_VALUES, PAD_MIN_DISTINCT_STEER } from './constants.ts'
import type { Device, FileContext } from './types.ts'

export function detectDevice(steer: Int8Array | null): Device {
  if (!steer || steer.length === 0) {
    return 'unknown'
  }
  const distinct = new Set<number>()
  for (const v of steer) {
    distinct.add(v)
  }
  if ([...distinct].every((v) => KEYBOARD_STEER_VALUES.includes(v))) {
    return 'keyboard'
  }
  return distinct.size >= PAD_MIN_DISTINCT_STEER ? 'pad' : 'mixed'
}

export async function buildContext(
  name: string,
  parsed: ParsedFile,
  inflate: Inflate,
): Promise<FileContext> {
  const ghost = parsed.ghosts[0]
  if (!ghost) {
    throw new Error(`${name}: no ghost in file`)
  }
  const input = ghost.inputs[0]
  const events = input ? decodeInputs(input) : []
  const steer = input ? steerSeries(events, input.ticks) : null
  const samples = ghost.recordData ? await decodeSamples(ghost.recordData, inflate) : null
  return { name, parsed, ghost, events, steer, samples, device: detectDevice(steer) }
}
