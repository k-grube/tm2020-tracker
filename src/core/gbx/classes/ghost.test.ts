import { describe, expect, test } from 'vitest'
import { GHOST_CLASS, GhostDef } from './ghost.ts'
import { createRegistry } from '../registry.ts'
import { readNode, type ReadContext } from '../node.ts'
import { IdState } from '../ids.ts'
import { ByteReader } from '../../io/byte-reader.ts'
import type { Ghost } from '../../model.ts'
import { parseGhostFixture } from '../../../test/ghost.ts'
import { loadFixture } from '../../../test/fixtures.ts'
import { parseGbx } from '../../parse.ts'

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

const PIKS = 0x534b4950
const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff]
const skippable = (id: number, payload: number[]) => [
  ...u32(id),
  ...u32(PIKS),
  ...u32(payload.length),
  ...payload,
]

// version 5 ghost with two entity indices, then the given skippable chunks
function ghostWith(chunks: number[]): Ghost {
  const body = new Uint8Array([
    ...u32(0x03092000),
    ...u32(5),
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
    ...str('ctx'),
    ...u32(0),
    ...u32(0xffffffff),
    ...u32(2),
    ...u32(2),
    ...u32(0),
    ...chunks,
    ...END,
  ])
  return readNode<Ghost>(ctxFor(body), GHOST_CLASS)
}

describe('race result chunks', () => {
  test('000 keeps the entity indices', () => {
    expect(ghostWith([]).entityIndices).toEqual([2, 0])
  })

  test('00A stunt score, 02A game rules and spawn landmark, 029 scope', () => {
    const g = ghostWith([
      ...skippable(0x0309200a, u32(7)),
      ...skippable(0x0309202a, [...u32(0xffff0229), ...u32(5)]),
      ...skippable(0x03092029, [
        ...u32(1),
        ...u32(2),
        ...str('season'),
        ...str('TimeAttack'),
        ...str(''),
      ]),
    ])
    expect(g.stuntScore).toBe(7)
    expect(g.gameRules).toBe(0xffff0229)
    expect(g.spawnLandmark).toBe(5)
    expect(g.scope).toEqual({
      scopeType: 2,
      scopeId: 'season',
      gameMode: 'TimeAttack',
      customData: '',
    })
  })

  test('01B v2: count, stunt, respawns with 0xFFFF as -1, race time, forward deltas', () => {
    const g = ghostWith(
      skippable(0x0309201b, [
        ...u32(2),
        ...u16(2),
        ...u16(7),
        ...u16(0xffff),
        ...u32(24794),
        ...u32(10000),
        ...u32(14794),
        ...u32(0xffffffff),
      ]),
    )
    expect(g.checkpoints01b).toEqual({
      totalMs: 24794,
      stuntScore: 7,
      respawns: -1,
      deltasMs: [10000, 14794],
    })
  })

  test('01B v1: reverse deltas from the race time become forward deltas', () => {
    const g = ghostWith(
      skippable(0x0309201b, [
        ...u32(1),
        ...u32(24794),
        ...u16(7),
        ...u16(3),
        ...u16(2),
        ...u32(14794),
        ...u32(0),
        ...u32(0xffffffff),
      ]),
    )
    expect(g.checkpoints01b).toEqual({
      totalMs: 24794,
      stuntScore: 7,
      respawns: 3,
      deltasMs: [10000, 14794],
    })
  })

  test('01B v0: absolute times become forward deltas', () => {
    const g = ghostWith(
      skippable(0x0309201b, [
        ...u32(0),
        ...u32(24794),
        ...u32(7),
        ...u32(3),
        ...u32(2),
        ...u32(10000),
        ...u32(24794),
      ]),
    )
    expect(g.checkpoints01b).toEqual({
      totalMs: 24794,
      stuntScore: 7,
      respawns: 3,
      deltasMs: [10000, 14794],
    })
  })

  test('02B v1 carries stunt, respawns, spawn landmark and the landmark per split, v2 is empty', () => {
    const g = ghostWith(
      skippable(0x0309202b, [
        ...u32(1),
        ...u32(24794),
        ...u32(7),
        ...u32(3),
        ...u32(5),
        ...u32(2),
        ...u32(10000),
        ...u32(0),
        ...u32(24794),
        ...u32(1),
        ...u32(0xffffffff),
      ]),
    )
    expect(g.checkpoints02b).toEqual({
      totalMs: 24794,
      stuntScore: 7,
      respawns: 3,
      spawnLandmark: 5,
      entries: [
        { timeMs: 10000, landmark: 0 },
        { timeMs: 24794, landmark: 1 },
      ],
    })
    expect(ghostWith(skippable(0x0309202b, u32(2))).checkpoints02b).toBeNull()
  })

  test('02D reads past a non-empty input store and keeps game rules, spawn landmark and sim flags', () => {
    const g = ghostWith(
      skippable(0x0309202d, [
        ...u32(1),
        ...u32(0),
        ...u32(1),
        ...u32(0x40000000),
        ...str('Steer'),
        ...u32(1),
        ...u32(0),
        ...u32(100),
        0,
        ...u32(5),
        ...str('exe'),
        ...u32(0x1234),
        ...u32(1),
        ...u32(2),
        ...u32(1000),
        ...u32(1030),
        ...str('Trackmania'),
        ...new Array<number>(32).fill(0),
        ...u32(0xffff0229),
        ...u32(5),
        ...u32(42),
        ...u32(16),
        ...str('settings'),
      ]),
    )
    expect(g.validation).toEqual({
      source: '02D',
      startUnixSec: 1000,
      endUnixSec: 1030,
      exeVersion: 'exe',
      exeChecksum: 0x1234,
      osKind: 1,
      cpuKind: 2,
      titleId: 'Trackmania',
      validationSeed: 42,
      raceSettings: 'settings',
      gameRules: 0xffff0229,
      spawnLandmark: 5,
      simFlags: 16,
    })
    expect(g.wallTime).toEqual({ startUnixSec: 1000, endUnixSec: 1030, source: '02D' })
  })

  test('025 reads the input store explicitly and keeps the trailing flags', () => {
    const g = ghostWith(
      skippable(0x03092025, [
        ...u32(1),
        ...u32(0),
        ...u32(0),
        ...u32(0),
        ...u32(0),
        ...u32(0),
        ...str('exe25'),
        ...u32(1),
        ...u32(1),
        ...u32(2),
        ...str('settings'),
        ...u32(42),
        ...u32(1),
      ]),
    )
    expect(g.validation025).toEqual({
      source: '025',
      startUnixSec: null,
      endUnixSec: null,
      exeVersion: 'exe25',
      exeChecksum: 1,
      osKind: 1,
      cpuKind: 2,
      titleId: '',
      validationSeed: 42,
      raceSettings: 'settings',
      gameRules: null,
      spawnLandmark: null,
      simFlags: 1,
    })
  })

  test('fixtures agree across the copies', () => {
    const g = parseGhostFixture('slidrz')
    expect(g.entityIndices).toEqual([0])
    expect(g.checkpoints01b!.stuntScore).toBe(g.stuntScore)
    expect(g.checkpoints01b!.respawns).toBe(g.respawns)
    expect(g.checkpoints01b!.deltasMs).toHaveLength(g.checkpoints.length)
    if (g.checkpoints02b) {
      expect(g.checkpoints02b.stuntScore).toBe(g.stuntScore)
      expect(g.checkpoints02b.respawns).toBe(g.respawns)
      expect(g.checkpoints02b.spawnLandmark).toBe(g.spawnLandmark)
    }
    expect(g.validation!.spawnLandmark).toBe(g.spawnLandmark)
    expect(g.validation!.gameRules).toBe(g.gameRules)
    expect(g.validation!.simFlags).not.toBeNull()
    expect(g.scope).not.toBeNull()
  })

  test('the tmx replay ghost points at element 2 as its car', () => {
    const parsed = parseGbx(loadFixture('tmxReplay'))
    const g = parsed.ghosts[0]!
    expect(g.entityIndices).toEqual([2])
  })
})
