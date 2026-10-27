import { describe, expect, test } from 'vitest'
import { GHOST_CLASS, GhostDef } from './ghost.ts'
import { createRegistry } from '../registry.ts'
import { readNode, type ReadContext } from '../node.ts'
import { IdState } from '../ids.ts'
import { ByteReader } from '../../io/byte-reader.ts'
import type { Ghost } from '../../model.ts'
import { parseGhostFixture } from '../../../test/ghost.ts'

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const str = (s: string) => {
  const b = Array.from(new TextEncoder().encode(s))
  return [...u32(b.length), ...b]
}
const END = u32(0xfacade01)

function ctxFor(bytes: Uint8Array): ReadContext {
  return {
    r: new ByteReader(bytes),
    ids: new IdState(),
    nodes: new Map(),
    registry: createRegistry(),
  }
}

const KNOWN = Array.from(GhostDef.chunks.keys())

describe('GhostDef on fixtures', () => {
  test('slidrz ghost fields', () => {
    const g = parseGhostFixture('slidrz')
    expect(g.raceTimeMs).toBe(24794)
    expect(g.login.length).toBeGreaterThan(0)
    expect(g.mapUid).toHaveLength(27)
    expect(g.checkpoints.length).toBeGreaterThan(0)
    expect(g.checkpoints.at(-1)!.timeMs).toBe(24794)
    expect(g.respawns).not.toBeNull()
    expect(g.inputs).toHaveLength(1)
    expect(g.inputs[0]!.version).toBe(12)
    expect(g.inputs[0]!.ticks).toBeGreaterThan(2000)
    expect(g.recordData).not.toBeNull()
    expect(g.unknownChunks.filter((id) => KNOWN.includes(id))).toEqual([])
    expect(g.wallTime).not.toBeNull()
    const wall = g.wallTime!.endUnixSec - g.wallTime!.startUnixSec
    expect(wall).toBeGreaterThanOrEqual(24)
    expect(wall).toBeLessThanOrEqual(60)
  })

  test('tmio ghost fields', () => {
    const g = parseGhostFixture('tmio')
    expect(g.raceTimeMs).toBeGreaterThan(0)
    expect(g.checkpoints.at(-1)!.timeMs).toBe(g.raceTimeMs)
    expect(g.inputs).toHaveLength(1)
  })
})

describe('GhostDef on a minimal hand-built ghost', () => {
  test('ghost without optional chunks parses with nulls', () => {
    const body = new Uint8Array([
      ...u32(0x0303f006),
      ...u32(1),
      ...u32(4),
      ...u32(0),
      ...u32(0x03092000),
      ...u32(0),
      ...u32(3),
      ...u32(0x40000000),
      ...str('CarSport'),
      ...u32(26),
      ...u32(0x40000000),
      ...str('Nadeo'),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...u32(0),
      ...str('nick'),
      ...str(''),
      ...u32(0x0309200c),
      ...u32(0),
      ...u32(0x0309200e),
      ...u32(0x40000000),
      ...str('ghost-uid'),
      ...u32(0x0309200f),
      ...str('login'),
      ...u32(0x03092010),
      ...u32(0x40000000),
      ...str('abcdefghijklmnopqrstuvwxyz1'),
      ...u32(0x0309201c),
      ...new Array<number>(32).fill(0),
      ...END,
    ])
    const g = readNode<Ghost>(ctxFor(body), GHOST_CLASS)
    expect(g.nickname).toBe('nick')
    expect(g.login).toBe('login')
    expect(g.playerModel.id).toBe('CarSport')
    expect(g.ghostUid).toBe('ghost-uid')
    expect(g.mapUid).toBe('abcdefghijklmnopqrstuvwxyz1')
    expect(g.inputs).toEqual([])
    expect(g.raceTimeMs).toBeNull()
    expect(g.wallTime).toBeNull()
    expect(g.recordData).toBeNull()
  })
})
