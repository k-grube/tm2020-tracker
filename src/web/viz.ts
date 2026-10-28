import { parseGbx } from '../core/parse.ts'
import { decodeInputs, steerSeries } from '../core/inputs/decode.ts'
import type { Checkpoint, InputEvent } from '../core/model.ts'

export interface FileViz {
  ticks: number
  steer: Int8Array | null
  events: InputEvent[]
  checkpoints: Checkpoint[]
}

// chart data for one file, null when the file does not parse (the report carries the error)
export function fileViz(bytes: Uint8Array): FileViz | null {
  try {
    const ghost = parseGbx(bytes).ghosts[0]
    if (!ghost) {
      return null
    }
    const input = ghost.inputs[0]
    const events = input ? decodeInputs(input) : []
    return {
      ticks: input?.ticks ?? 0,
      steer: input ? steerSeries(events, input.ticks) : null,
      events,
      checkpoints: ghost.checkpoints,
    }
  } catch {
    return null
  }
}
