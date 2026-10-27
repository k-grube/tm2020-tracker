import { parseHeader, type GbxHeader } from './gbx/header.ts'
import { lzo1xDecompress } from './gbx/lzo1x.ts'
import { IdState } from './gbx/ids.ts'
import { hex, readNode, type ReadContext } from './gbx/node.ts'
import { createRegistry } from './gbx/registry.ts'
import { GHOST_CLASS } from './gbx/classes/ghost.ts'
import { REPLAY_CLASS, readReplayBody, readReplayHeader } from './gbx/classes/replay.ts'
import { ByteReader } from './io/byte-reader.ts'
import { UnsupportedError } from './io/errors.ts'
import type { Ghost, ParsedFile } from './model.ts'

export function decompressBody(bytes: Uint8Array, header: GbxHeader): Uint8Array {
  if (!header.bodyCompressed) {
    return bytes.subarray(header.bodyOffset)
  }
  const r = new ByteReader(bytes, header.bodyOffset)
  const dstSize = r.u32()
  return lzo1xDecompress(r.bytes(r.u32()), dstSize)
}

export function parseGbx(bytes: Uint8Array): ParsedFile {
  const header = parseHeader(bytes)
  // header chunks and body each start their own lookback table
  const ctx: ReadContext = {
    r: new ByteReader(decompressBody(bytes, header)),
    ids: new IdState(),
    nodes: new Map(),
    registry: createRegistry(),
  }
  if (header.classId === GHOST_CLASS) {
    const ghost = readNode<Ghost>(ctx, GHOST_CLASS)
    return { kind: 'ghost', ghosts: [ghost], replay: null, warnings: [] }
  }
  if (header.classId === REPLAY_CLASS) {
    const replay = readReplayHeader(header.headerChunks, new IdState())
    const { ghosts, warnings } = readReplayBody(ctx)
    return { kind: 'replay', ghosts, replay, warnings }
  }
  throw new UnsupportedError(`root class ${hex(header.classId)}`)
}
