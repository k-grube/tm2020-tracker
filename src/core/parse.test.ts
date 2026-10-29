import { describe, expect, test } from 'vitest'
import { parseGbx } from './parse.ts'
import { UnsupportedError } from './io/errors.ts'
import { LOCAL_REPLAY_RACE_TIME_MS, loadFixture } from '../test/fixtures.ts'
import { patchSkippable } from '../test/gbx-mutate.ts'

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const str = (s: string) => {
  const b = Array.from(new TextEncoder().encode(s))
  return [...u32(b.length), ...b]
}
const END = u32(0xfacade01)

// uncompressed replay file: header with no header chunks, body with map data, one inline ghost, then a clip ref
function replayWithClip(): Uint8Array {
  const ghost = [
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
  ]
  const body = [
    ...u32(0x03093002),
    ...u32(4),
    1,
    2,
    3,
    4,
    ...u32(0x03093014),
    ...u32(10),
    ...u32(1),
    ...u32(1),
    ...u32(0x03092000),
    ...ghost,
    ...u32(0),
    ...u32(0),
    ...u32(0x03093015),
    ...u32(5),
  ]
  return new Uint8Array([
    0x47,
    0x42,
    0x58,
    6,
    0,
    0x42,
    0x55,
    0x55,
    0x52,
    ...u32(0x03093000),
    ...u32(0),
    ...u32(2),
    ...u32(0),
    ...body,
  ])
}

describe('parseGbx', () => {
  test('slidrz parses as ghost', () => {
    const p = parseGbx(loadFixture('slidrz'))
    expect(p.kind).toBe('ghost')
    expect(p.ghosts).toHaveLength(1)
    expect(p.replay).toBeNull()
    expect(p.ghosts[0]!.raceTimeMs).toBe(24794)
  })

  test('tmio parses as ghost', () => {
    expect(parseGbx(loadFixture('tmio')).kind).toBe('ghost')
  })

  test('tmx replay fixture parses', () => {
    const p = parseGbx(loadFixture('tmxReplay'))
    expect(p.kind).toBe('replay')
    expect(p.replay!.mapInfo.id).toHaveLength(27)
    expect(p.ghosts.length).toBeGreaterThanOrEqual(1)
    expect(p.ghosts[0]!.raceTimeMs).toBe(78321)
  })

  test.each(['localReplay', 'localPbReplay'] as const)('%s parses with wall time', (name) => {
    const p = parseGbx(loadFixture(name))
    expect(p.kind).toBe('replay')
    expect(p.ghosts.length).toBeGreaterThanOrEqual(1)
    const g = p.ghosts[0]!
    expect(g.raceTimeMs).toBe(LOCAL_REPLAY_RACE_TIME_MS)
    expect(g.wallTime).not.toBeNull()
    const wall = g.wallTime!.endUnixSec - g.wallTime!.startUnixSec
    expect(wall).toBeGreaterThanOrEqual(20)
    expect(wall).toBeLessThanOrEqual(23)
  })

  test('replay with clip still returns ghosts and a warning', () => {
    const p = parseGbx(replayWithClip())
    expect(p.kind).toBe('replay')
    expect(p.ghosts).toHaveLength(1)
    expect(p.ghosts[0]!.login).toBe('login')
    expect(p.warnings.some((w) => w.includes('0x03093015'))).toBe(true)
  })

  test('unknown class id throws UnsupportedError', () => {
    const bytes = replayWithClip()
    bytes[11] = 0x04
    expect(() => parseGbx(bytes)).toThrow(UnsupportedError)
  })
})

describe('validation copy and recording id', () => {
  test('025 duplicates 02D on slidrz', () => {
    const g = parseGbx(loadFixture('slidrz')).ghosts[0]!
    expect(g.validation!.source).toBe('02D')
    expect(g.validation!.startUnixSec).toBe(1754498149)
    expect(g.validation!.endUnixSec).toBe(1754498174)
    expect(g.validation025!.source).toBe('025')
    expect(g.validation025!.exeVersion).toBe(g.validation!.exeVersion)
    expect(g.validation025!.exeChecksum).toBe(g.validation!.exeChecksum)
    expect(g.validation025!.raceSettings).toBe(g.validation!.raceSettings)
    expect(g.validation025!.validationSeed).toBe(26593895)
    expect(g.validation025!.startUnixSec).toBeNull()
    expect(g.recordingId).toMatch(/^[0-9a-f]{32}$/)
    expect(g.unknownChunks).not.toContain(0x03092025)
    expect(g.unknownChunks).not.toContain(0x03092026)
  })

  test('02D with an input store reads the fields after it', () => {
    const bytes = patchSkippable(loadFixture('slidrz'), 0x0309202d, (p) => {
      // has inputs 1, then an empty store: u32, 0 ids, 0 events, u32
      const out = new Uint8Array(p.length + 16)
      out[0] = 1
      out.set(p.subarray(4), 20)
      return out
    })
    const g = parseGbx(bytes).ghosts[0]!
    expect(g.validation!.source).toBe('02D')
    expect(g.validation!.exeVersion).toContain('date=2025-07-04')
    expect(g.validation!.validationSeed).toBe(26593895)
    expect(g.validation).toEqual(parseGbx(loadFixture('slidrz')).ghosts[0]!.validation)
  })
})
