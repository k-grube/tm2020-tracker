import { decodeInputStream, steerSeries } from '../inputs/decode.ts'
import { decodeRecordData } from '../samples/decode.ts'
import type { ArenaCheckpoint, Ghost, Inflate, InputEvent, ParsedFile, Sample } from '../model.ts'
import { KEYBOARD_STEER_VALUES, PAD_MIN_DISTINCT_STEER } from './constants.ts'
import type { Device, FileContext, LeaderboardEntry } from './types.ts'

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

// a replay can hold several ghosts, the one with the header login is the author's
export function pickGhost(parsed: ParsedFile): Ghost | null {
  const login = parsed.replay?.login
  if (login) {
    const own = parsed.ghosts.find((g) => g.login === login)
    if (own) {
      return own
    }
  }
  return parsed.ghosts[0] ?? null
}

// each decode stage fails on its own, the ghost fields and the other stages still reach the report
export async function buildContext(
  name: string,
  parsed: ParsedFile,
  inflate: Inflate,
  leaderboard: LeaderboardEntry | null = null,
): Promise<FileContext> {
  const ghost = pickGhost(parsed)
  if (!ghost) {
    throw new Error(`${name}: no ghost in file`)
  }
  const input = ghost.inputs[0]
  let events: InputEvent[] = []
  let steer: Int8Array | null = null
  let decodedTicks: number | null = null
  let inputError: string | null = null
  let samplesError: string | null = null
  let firstVehicleTick: number | null = null
  let kinds: number[] = []
  let kindTicks: number[] = []
  let minSteer: number | null = null
  if (input) {
    try {
      const decoded = decodeInputStream(input)
      events = decoded.events
      decodedTicks = decoded.decodedTicks
      firstVehicleTick = decoded.firstVehicleTick
      kinds = decoded.kinds
      kindTicks = decoded.kindTicks
      minSteer = decoded.minSteer
      steer = steerSeries(events, input.ticks)
    } catch (e) {
      inputError = `inputs not decoded: ${message(e)}`
      parsed.warnings.push(inputError)
    }
  }
  let samples: Sample[] | null = null
  let checkpointRecords: ArenaCheckpoint[] | null = null
  if (ghost.recordData) {
    try {
      const record = await decodeRecordData(ghost.recordData, inflate, {
        carIndices: ghost.entityIndices,
        raceTimeMs: ghost.raceTimeMs,
      })
      samples = record.samples
      checkpointRecords = record.checkpoints
    } catch (e) {
      samplesError = `record data not decoded: ${message(e)}`
      parsed.warnings.push(samplesError)
    }
  }
  return {
    name,
    parsed,
    ghost,
    leaderboard,
    events,
    steer,
    samples,
    checkpointRecords,
    decodedTicks,
    inputError,
    samplesError,
    firstVehicleTick,
    kinds,
    kindTicks,
    minSteer,
    device: detectDevice(steer),
  }
}
