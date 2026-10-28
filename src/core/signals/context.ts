import { decodeInputStream, steerSeries } from '../inputs/decode.ts'
import { decodeSamples } from '../samples/decode.ts'
import type { Inflate, InputEvent, ParsedFile, Sample } from '../model.ts'
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

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// each decode stage fails on its own, the ghost fields and the other stages still reach the report
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
  let events: InputEvent[] = []
  let steer: Int8Array | null = null
  let decodedTicks: number | null = null
  if (input) {
    try {
      const decoded = decodeInputStream(input)
      events = decoded.events
      decodedTicks = decoded.decodedTicks
      steer = steerSeries(events, input.ticks)
    } catch (e) {
      parsed.warnings.push(`inputs not decoded: ${message(e)}`)
    }
  }
  let samples: Sample[] | null = null
  if (ghost.recordData) {
    try {
      samples = await decodeSamples(ghost.recordData, inflate)
    } catch (e) {
      parsed.warnings.push(`record data not decoded: ${message(e)}`)
    }
  }
  return { name, parsed, ghost, events, steer, samples, decodedTicks, device: detectDevice(steer) }
}
