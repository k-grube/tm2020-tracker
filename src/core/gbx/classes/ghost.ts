import { readNodeRef, type ChunkReader, type ClassDef, type ReadContext } from '../node.ts'
import { readId, readIdent, readPackDesc } from '../ids.ts'
import type { ByteReader } from '../../io/byte-reader.ts'
import { ParseError } from '../../io/errors.ts'
import type { EntRecordData, Ghost, Validation } from '../../model.ts'
import type { IdState } from '../ids.ts'

export const GHOST_CLASS = 0x03092000

function createGhost(): Ghost {
  return {
    nickname: '',
    login: '',
    zone: null,
    clubTag: null,
    trigram: null,
    recordingContext: null,
    playerModel: { id: '', collection: '', author: '' },
    mapUid: '',
    ghostUid: '',
    raceTimeMs: null,
    respawns: null,
    stuntScore: null,
    gameRules: null,
    spawnLandmark: null,
    scope: null,
    entityIndices: [],
    checkpoints: [],
    checkpoints01b: null,
    checkpoints02b: null,
    ghostVersion: null,
    inputs: [],
    wallTime: null,
    validation: null,
    validation025: null,
    recordingId: null,
    recordData: null,
    rawChunks: new Map(),
    unknownChunks: [],
  }
}

function readBadge(r: ByteReader): void {
  const version = r.u32()
  r.f32()
  r.f32()
  r.f32()
  if (version === 0) {
    r.i32()
    r.string()
  }
  const stickers = r.u32()
  for (let i = 0; i < stickers; i++) {
    r.string()
    r.string()
  }
  const layers = r.u32()
  for (let i = 0; i < layers; i++) {
    r.string()
  }
}

function read000(ctx: ReadContext, g: Ghost): void {
  const r = ctx.r
  const version = r.u32()
  const appearanceVersion = version >= 9 ? r.u32() : 0
  g.playerModel = readIdent(r, ctx.ids)
  r.f32()
  r.f32()
  r.f32()
  const skins = r.u32()
  for (let i = 0; i < skins; i++) {
    readPackDesc(r)
  }
  if (r.bool()) {
    readBadge(r)
  }
  if (appearanceVersion >= 1) {
    r.string()
  }
  g.nickname = r.string()
  r.string()
  if (version >= 2) {
    g.recordingContext = r.string()
  }
  if (version >= 4) {
    r.bool()
  }
  if (version >= 5) {
    g.recordData = readNodeRef<EntRecordData>(ctx)
    const n = r.u32()
    for (let i = 0; i < n; i++) {
      g.entityIndices.push(r.i32())
    }
  }
  if (version >= 6) {
    g.trigram = r.string()
  }
  if (version >= 7) {
    g.zone = r.string()
  }
  if (version >= 8) {
    g.clubTag = r.string()
  }
}

function read00b(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  const n = p!.u32()
  for (let i = 0; i < n; i++) {
    g.checkpoints.push({ timeMs: p!.i32(), stuntsScore: p!.i32() })
  }
}

// forward deltas from absolute split times
function toDeltas(times: number[]): number[] {
  return times.map((t, i) => t - (times[i - 1] ?? 0))
}

// v2: u16 count, u16 stunt, u16 respawns (0xFFFF unset), u32 race time, forward deltas, i32
// v1: u32 race time, u16 stunt, u16 respawns, u16 count, deltas back from the race time, i32
// v0: u32 race time, u32 stunt, u32 respawns, u32 count, absolute times
function read01b(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  const version = p!.u32()
  if (version >= 2) {
    const n = p!.u16()
    const stuntScore = p!.u16()
    const raw = p!.u16()
    const totalMs = p!.i32()
    const deltasMs: number[] = []
    for (let i = 0; i < n; i++) {
      deltasMs.push(p!.i32())
    }
    g.checkpoints01b = { totalMs, stuntScore, respawns: raw === 0xffff ? -1 : raw, deltasMs }
    return
  }
  if (version === 1) {
    const totalMs = p!.i32()
    const stuntScore = p!.u16()
    const respawns = p!.u16()
    const n = p!.u16()
    const times: number[] = []
    for (let i = 0; i < n; i++) {
      times.push(totalMs - p!.i32())
    }
    g.checkpoints01b = { totalMs, stuntScore, respawns, deltasMs: toDeltas(times) }
    return
  }
  const totalMs = p!.i32()
  const stuntScore = p!.i32()
  const respawns = p!.i32()
  const n = p!.u32()
  const times: number[] = []
  for (let i = 0; i < n; i++) {
    times.push(p!.i32())
  }
  g.checkpoints01b = { totalMs, stuntScore, respawns, deltasMs: toDeltas(times) }
}

// u32, u32 ids (1000 at most), ids, u32 events, u32, events x (u32 time, u8 id index, u32 value).
// empty in every file seen, read for its size so the fields after it line up
function skipInputStore(r: ByteReader, ids: IdState): void {
  r.u32()
  const nIds = r.u32()
  if (nIds > 1000) {
    throw new ParseError(`input store declares ${nIds} ids`, r.pos)
  }
  for (let i = 0; i < nIds; i++) {
    readId(r, ids)
  }
  const nEvents = r.u32()
  r.u32()
  for (let i = 0; i < nEvents; i++) {
    r.u32()
    r.u8()
    r.u32()
  }
}

function read01d(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  const version = p!.u32()
  const n = p!.u32()
  for (let i = 0; i < n; i++) {
    const v = p!.i32()
    const u01 = p!.i32()
    const startOffsetMs = version >= 4 ? p!.timeint() : null
    const ticks = p!.i32()
    const data = p!.data()
    // every tick costs at least one bit, a larger count is a crafted file
    if (ticks < 0 || ticks > data.length * 8) {
      throw new ParseError(`input ticks ${ticks} exceed ${data.length} data bytes`, p!.pos)
    }
    g.inputs.push({ version: v, u01, startOffsetMs, ticks, data })
  }
}

// u32 version (2+ carries nothing), i32 race time, i32 stunt, i32 respawns, i32 spawn landmark,
// i32 n, n x (i32 time, i32 landmark), i32 -1
function read02b(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  if (p!.u32() >= 2) {
    return
  }
  const totalMs = p!.i32()
  const stuntScore = p!.i32()
  const respawns = p!.i32()
  const spawnLandmark = p!.i32()
  const n = p!.i32()
  const entries: { timeMs: number; landmark: number }[] = []
  for (let i = 0; i < n; i++) {
    entries.push({ timeMs: p!.i32(), landmark: p!.i32() })
  }
  g.checkpoints02b = { totalMs, stuntScore, respawns, spawnLandmark, entries }
}

function read029(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  p!.u32()
  g.scope = {
    scopeType: p!.i32(),
    scopeId: p!.string(),
    gameMode: p!.string(),
    customData: p!.string(),
  }
}

function read02a(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  g.gameRules = p!.u32()
  g.spawnLandmark = p!.i32()
}

function read02c(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  p!.u32()
  g.wallTime = { startUnixSec: p!.u32(), endUnixSec: p!.u32(), source: '02C' }
}

// u32 has inputs (then the input store), exe, checksum, os, cpu, wall start, wall end, title id,
// 32 B title checksum, game rules, spawn landmark, seed, sim flags, race settings
function read02d(ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  if (p!.u32() !== 0) {
    skipInputStore(p!, ctx.ids)
  }
  const exeVersion = p!.string()
  const exeChecksum = p!.u32()
  const osKind = p!.i32()
  const cpuKind = p!.i32()
  const startUnixSec = p!.u32()
  const endUnixSec = p!.u32()
  const titleId = p!.string()
  p!.bytes(32)
  const gameRules = p!.u32()
  const spawnLandmark = p!.i32()
  const validationSeed = p!.i32()
  const simFlags = p!.u32()
  const raceSettings = p!.string()
  g.validation = {
    source: '02D',
    startUnixSec,
    endUnixSec,
    exeVersion,
    exeChecksum,
    osKind,
    cpuKind,
    titleId,
    validationSeed,
    raceSettings,
    gameRules,
    spawnLandmark,
    simFlags,
  }
  if (!g.wallTime) {
    g.wallTime = { startUnixSec, endUnixSec, source: '02D' }
  }
}

// 025: u32 version, u32 events duration, input store, exe, checksum, os, cpu, race settings, seed,
// u32 steering wheel sensitivity flag. read before 02D (lower id), so it stands in until 02D
// overrides it
function read025(ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  const version = p!.u32()
  const eventsDuration = p!.u32()
  const validation: Validation = {
    source: '025',
    startUnixSec: null,
    endUnixSec: null,
    exeVersion: '',
    exeChecksum: 0,
    osKind: 0,
    cpuKind: 0,
    titleId: '',
    validationSeed: 0,
    raceSettings: '',
    gameRules: null,
    spawnLandmark: null,
    simFlags: null,
  }
  if (eventsDuration !== 0 || version !== 0) {
    skipInputStore(p!, ctx.ids)
    validation.exeVersion = p!.string()
    validation.exeChecksum = p!.u32()
    validation.osKind = p!.i32()
    validation.cpuKind = p!.i32()
    validation.raceSettings = p!.string()
    validation.validationSeed = p!.i32()
    validation.simFlags = p!.u32()
  }
  g.validation025 = validation
  if (!g.validation) {
    g.validation = g.validation025
  }
}

function read026(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  g.recordingId = Array.from(p!.bytes(16), (b) => b.toString(16).padStart(2, '0')).join('')
}

const keepRaw =
  (id: number): ChunkReader<Ghost> =>
  (_ctx, g, p) => {
    g.rawChunks.set(id, p!.bytes(p!.remaining()))
  }

export const GhostDef: ClassDef<Ghost> = {
  classId: GHOST_CLASS,
  create: createGhost,
  chunks: new Map<number, ChunkReader<Ghost>>([
    [
      0x0303f006,
      (ctx) => {
        ctx.r.bool()
        ctx.r.i32()
        ctx.r.data()
      },
    ],
    [0x0303f007, () => {}],
    [0x03092000, read000],
    [
      0x03092005,
      (_ctx, g, p) => {
        g.raceTimeMs = p!.timeint()
      },
    ],
    [
      0x03092008,
      (_ctx, g, p) => {
        g.respawns = p!.i32()
      },
    ],
    [
      0x0309200a,
      (_ctx, g, p) => {
        g.stuntScore = p!.i32()
      },
    ],
    [0x0309200b, read00b],
    [
      0x0309200c,
      (ctx) => {
        ctx.r.i32()
      },
    ],
    [
      0x0309200e,
      (ctx, g) => {
        g.ghostUid = readId(ctx.r, ctx.ids)
      },
    ],
    [
      0x0309200f,
      (ctx, g) => {
        g.login = ctx.r.string()
      },
    ],
    [
      0x03092010,
      (ctx, g) => {
        g.mapUid = readId(ctx.r, ctx.ids)
      },
    ],
    [0x03092013, () => {}],
    [
      0x03092014,
      (_ctx, g, p) => {
        g.ghostVersion = p!.i32()
      },
    ],
    [0x0309201a, () => {}],
    [0x0309201b, read01b],
    [
      0x0309201c,
      (ctx) => {
        ctx.r.bytes(32)
      },
    ],
    [0x0309201d, read01d],
    [0x03092022, keepRaw(0x03092022)],
    [0x03092023, keepRaw(0x03092023)],
    [0x03092025, read025],
    [0x03092026, read026],
    [0x03092029, read029],
    [0x0309202a, read02a],
    [0x0309202b, read02b],
    [0x0309202c, read02c],
    [0x0309202d, read02d],
  ]),
  onUnknownSkippable: (g, id, data) => {
    g.rawChunks.set(id, data)
    g.unknownChunks.push(id)
  },
}
