import { readNodeRef, type ChunkReader, type ClassDef, type ReadContext } from '../node.ts'
import { readId, readIdent, readPackDesc } from '../ids.ts'
import type { ByteReader } from '../../io/byte-reader.ts'
import { ParseError } from '../../io/errors.ts'
import type { EntRecordData, Ghost } from '../../model.ts'

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
    checkpoints: [],
    ghostVersion: null,
    inputs: [],
    wallTime: null,
    validation: null,
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
      r.i32()
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

function read02c(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  p!.u32()
  g.wallTime = { startUnixSec: p!.u32(), endUnixSec: p!.u32(), source: '02C' }
}

function read02d(_ctx: ReadContext, g: Ghost, p?: ByteReader): void {
  const u01 = p!.i32()
  if (u01 >= 1) {
    return
  }
  const exeVersion = p!.string()
  const exeChecksum = p!.u32()
  const osKind = p!.i32()
  const cpuKind = p!.i32()
  const startUnixSec = p!.u32()
  const endUnixSec = p!.u32()
  const titleId = p!.string()
  p!.bytes(32)
  p!.i32()
  p!.i32()
  const validationSeed = p!.i32()
  p!.i32()
  const raceSettings = p!.string()
  g.validation = { exeVersion, exeChecksum, osKind, cpuKind, titleId, validationSeed, raceSettings }
  if (!g.wallTime) {
    g.wallTime = { startUnixSec, endUnixSec, source: '02D' }
  }
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
    [
      0x0309201c,
      (ctx) => {
        ctx.r.bytes(32)
      },
    ],
    [0x0309201d, read01d],
    [0x03092022, keepRaw(0x03092022)],
    [0x03092023, keepRaw(0x03092023)],
    [0x0309202c, read02c],
    [0x0309202d, read02d],
  ]),
  onUnknownSkippable: (g, id, data) => {
    g.rawChunks.set(id, data)
    g.unknownChunks.push(id)
  },
}
