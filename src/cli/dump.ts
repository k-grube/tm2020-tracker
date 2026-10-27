import { createHash } from 'node:crypto'
import { parseGbx } from '../core/parse.ts'
import { decodeInputs } from '../core/inputs/decode.ts'
import { decodeSamples } from '../core/samples/decode.ts'
import { hex } from '../core/gbx/node.ts'
import type { Ghost, InputEvent, ParsedFile } from '../core/model.ts'
import { inflateNode } from './inflate.ts'

export interface ByteSummary {
  length: number
  sha256: string
}

export type DumpGhost = Omit<Ghost, 'inputs' | 'recordData' | 'rawChunks' | 'unknownChunks'> & {
  inputs: {
    version: number
    u01: number
    startOffsetMs: number | null
    ticks: number
    data: ByteSummary
  }[]
  recordData: { version: number; uncompressedSize: number; compressed: ByteSummary } | null
  rawChunks: Record<string, ByteSummary>
  unknownChunks: string[]
}

export interface DumpResult {
  kind: ParsedFile['kind']
  replay: ParsedFile['replay']
  warnings: string[]
  ghosts: DumpGhost[]
  inputs: {
    ticks: number
    startOffsetMs: number | null
    eventCount: number
    firstEvents: InputEvent[]
  }[]
  samples: { count: number; firstTimeMs: number; lastTimeMs: number } | null
  unknownChunks: string[]
}

function summarize(bytes: Uint8Array): ByteSummary {
  return { length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
}

function dumpGhost(g: Ghost): DumpGhost {
  const { inputs, recordData, rawChunks, unknownChunks, ...rest } = g
  return {
    ...rest,
    inputs: inputs.map((i) => ({ ...i, data: summarize(i.data) })),
    recordData: recordData ? { ...recordData, compressed: summarize(recordData.compressed) } : null,
    rawChunks: Object.fromEntries([...rawChunks].map(([id, data]) => [hex(id), summarize(data)])),
    unknownChunks: unknownChunks.map(hex),
  }
}

export async function dumpFile(bytes: Uint8Array, opts: { events: number }): Promise<DumpResult> {
  const parsed = parseGbx(bytes)
  const first = parsed.ghosts[0]
  const inputs = (first?.inputs ?? []).map((i) => {
    const events = decodeInputs(i)
    return {
      ticks: i.ticks,
      startOffsetMs: i.startOffsetMs,
      eventCount: events.length,
      firstEvents: events.slice(0, opts.events),
    }
  })
  let samples: DumpResult['samples'] = null
  if (first?.recordData) {
    const s = await decodeSamples(first.recordData, inflateNode)
    samples = { count: s.length, firstTimeMs: s[0]?.timeMs ?? 0, lastTimeMs: s.at(-1)?.timeMs ?? 0 }
  }
  return {
    kind: parsed.kind,
    replay: parsed.replay,
    warnings: parsed.warnings,
    ghosts: parsed.ghosts.map(dumpGhost),
    inputs,
    samples,
    unknownChunks: first ? first.unknownChunks.map(hex) : [],
  }
}

export function formatDump(d: DumpResult): string {
  const lines: string[] = []
  lines.push(`kind: ${d.kind}`)
  if (d.replay) {
    lines.push(
      `replay: v${d.replay.version} map ${d.replay.mapInfo.id} time ${d.replay.timeMs} nick ${d.replay.nickname} login ${d.replay.login ?? ''}`,
    )
  }
  for (const w of d.warnings) {
    lines.push(`warning: ${w}`)
  }
  d.ghosts.forEach((g, i) => {
    lines.push(`ghost ${i}: ${g.nickname} (${g.login}) map ${g.mapUid}`)
    lines.push(`  race ${g.raceTimeMs} ms, respawns ${g.respawns}, ghost version ${g.ghostVersion}`)
    lines.push(`  checkpoints: ${g.checkpoints.map((c) => c.timeMs).join(' ')}`)
    if (g.wallTime) {
      const wall = g.wallTime.endUnixSec - g.wallTime.startUnixSec
      lines.push(`  wall time ${wall} s (chunk ${g.wallTime.source})`)
    }
    if (g.validation) {
      lines.push(`  exe ${g.validation.exeVersion}, title ${g.validation.titleId}`)
    }
    lines.push(
      `  record data: ${g.recordData ? `v${g.recordData.version} ${g.recordData.compressed.length} bytes` : 'none'}`,
    )
    lines.push(`  raw chunks: ${Object.keys(g.rawChunks).join(' ') || 'none'}`)
    lines.push(`  unknown chunks: ${g.unknownChunks.join(' ') || 'none'}`)
  })
  d.inputs.forEach((inp, i) => {
    lines.push(
      `inputs ${i}: ${inp.ticks} ticks, start offset ${inp.startOffsetMs}, ${inp.eventCount} events`,
    )
    for (const e of inp.firstEvents) {
      lines.push(
        `  ${String(e.timeMs).padStart(7)} ms  ${e.kind} ${e.value}${e.value2 === undefined ? '' : ' ' + e.value2}`,
      )
    }
  })
  if (d.samples) {
    lines.push(
      `samples: ${d.samples.count}, ${d.samples.firstTimeMs} ms to ${d.samples.lastTimeMs} ms`,
    )
  }
  return lines.join('\n') + '\n'
}
