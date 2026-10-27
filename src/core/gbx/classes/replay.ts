import { hex, NODE_END, readNodeRef, UnknownChunkError, type ReadContext } from '../node.ts'
import { readId, readIdent, type IdState } from '../ids.ts'
import { ByteReader } from '../../io/byte-reader.ts'
import type { HeaderChunk } from '../header.ts'
import type { Ghost, ReplayHeader } from '../../model.ts'

export const REPLAY_CLASS = 0x03093000
const PIKS = 0x534b4950
const CHUNK_HEADER = 0x03093000
const CHUNK_MAP = 0x03093002
const CHUNK_GHOSTS = 0x03093014

export function readReplayHeader(chunks: HeaderChunk[], ids: IdState): ReplayHeader | null {
  const chunk = chunks.find((c) => c.id === CHUNK_HEADER)
  if (!chunk) {
    return null
  }
  const r = new ByteReader(chunk.data)
  const version = r.u32()
  const out: ReplayHeader = {
    version,
    mapInfo: { id: '', collection: '', author: '' },
    timeMs: null,
    nickname: '',
    login: null,
    titleId: null,
  }
  if (version >= 4 && version !== 9999) {
    out.mapInfo = readIdent(r, ids)
    out.timeMs = r.timeint()
    out.nickname = r.string()
    if (version >= 6) {
      out.login = r.string()
    }
  }
  if (version > 7) {
    r.u8()
    out.titleId = readId(r, ids)
  }
  return out
}

// walks the replay body only as far as the ghost list, later chunks (clip, record data) are never read
export function readReplayBody(ctx: ReadContext): { ghosts: Ghost[]; warnings: string[] } {
  const r = ctx.r
  const ghosts: Ghost[] = []
  const warnings: string[] = []
  for (;;) {
    if (r.remaining() < 4) {
      return { ghosts, warnings }
    }
    const at = r.pos
    const chunkId = r.u32()
    if (chunkId === NODE_END) {
      return { ghosts, warnings }
    }
    if (chunkId === CHUNK_MAP) {
      r.data()
      continue
    }
    if (chunkId === CHUNK_GHOSTS) {
      r.u32()
      const n = r.u32()
      for (let i = 0; i < n; i++) {
        const g = readNodeRef<Ghost>(ctx)
        if (g) {
          ghosts.push(g)
        }
      }
      r.i32()
      const m = r.u32()
      r.skip(m * 8)
      if (r.remaining() >= 4) {
        warnings.push(`stopped before chunk ${hex(r.peekU32())}, ${r.remaining()} bytes unread`)
      }
      return { ghosts, warnings }
    }
    if (r.remaining() >= 4 && r.peekU32() === PIKS) {
      r.u32()
      r.data()
      continue
    }
    throw new UnknownChunkError(REPLAY_CLASS, chunkId, at)
  }
}
