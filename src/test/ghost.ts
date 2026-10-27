import { GHOST_CLASS } from '../core/gbx/classes/ghost.ts'
import { createRegistry } from '../core/gbx/registry.ts'
import { readNode, type ReadContext } from '../core/gbx/node.ts'
import { IdState } from '../core/gbx/ids.ts'
import { parseHeader } from '../core/gbx/header.ts'
import { lzo1xDecompress } from '../core/gbx/lzo1x.ts'
import { ByteReader } from '../core/io/byte-reader.ts'
import type { Ghost } from '../core/model.ts'
import { loadFixture, type FixtureName } from './fixtures.ts'

export function bodyContext(bytes: Uint8Array): ReadContext {
  const h = parseHeader(bytes)
  const r = new ByteReader(bytes, h.bodyOffset)
  const dstSize = r.u32()
  const body = lzo1xDecompress(r.bytes(r.u32()), dstSize)
  return {
    r: new ByteReader(body),
    ids: new IdState(),
    nodes: new Map(),
    registry: createRegistry(),
  }
}

export function parseGhostFixture(name: FixtureName): Ghost {
  return readNode<Ghost>(bodyContext(loadFixture(name)), GHOST_CLASS)
}
