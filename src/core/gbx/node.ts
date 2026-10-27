import { ByteReader } from '../io/byte-reader.ts'
import { ParseError } from '../io/errors.ts'
import type { IdState } from './ids.ts'

export const NODE_END = 0xfacade01
const PIKS = 0x534b4950

export interface ReadContext {
  r: ByteReader
  ids: IdState
  nodes: Map<number, unknown>
  registry: ClassRegistry
}

// payload is set for skippable chunks and bounded to the chunk's bytes
export type ChunkReader<T> = (ctx: ReadContext, node: T, payload?: ByteReader) => void

export interface ClassDef<T> {
  classId: number
  create(): T
  chunks: Map<number, ChunkReader<T>>
  onUnknownSkippable?(node: T, chunkId: number, data: Uint8Array): void
}

export type ClassRegistry = Map<number, ClassDef<unknown>>

export function hex(n: number): string {
  return '0x' + n.toString(16).padStart(8, '0')
}

export class UnknownChunkError extends ParseError {
  readonly classId: number
  readonly chunkId: number

  constructor(classId: number, chunkId: number, offset: number) {
    super(`unknown non-skippable chunk ${hex(chunkId)} in class ${hex(classId)}`, offset)
    this.name = 'UnknownChunkError'
    this.classId = classId
    this.chunkId = chunkId
  }
}

function defFor<T>(ctx: ReadContext, classId: number): ClassDef<T> {
  const def = ctx.registry.get(classId)
  if (!def) {
    throw new ParseError(`unknown class ${hex(classId)}`, ctx.r.pos)
  }
  return def as ClassDef<T>
}

function readChunks<T>(ctx: ReadContext, def: ClassDef<T>, node: T): void {
  const r = ctx.r
  for (;;) {
    const at = r.pos
    const chunkId = r.u32()
    if (chunkId === NODE_END) {
      return
    }
    const reader = def.chunks.get(chunkId)
    if (r.remaining() >= 4 && r.peekU32() === PIKS) {
      r.u32()
      const data = r.data()
      if (reader) {
        // reader sees only the chunk payload, ctx.r included
        const sub: ReadContext = { ...ctx, r: new ByteReader(data) }
        reader(sub, node, sub.r)
      } else if (def.onUnknownSkippable) {
        def.onUnknownSkippable(node, chunkId, data)
      }
      continue
    }
    if (!reader) {
      throw new UnknownChunkError(def.classId, chunkId, at)
    }
    reader(ctx, node)
  }
}

export function readNode<T>(ctx: ReadContext, classId: number): T {
  const def = defFor<T>(ctx, classId)
  const node = def.create()
  readChunks(ctx, def, node)
  return node
}

export function readNodeRef<T>(ctx: ReadContext): T | null {
  const index = ctx.r.i32()
  if (index === -1) {
    return null
  }
  const existing = ctx.nodes.get(index)
  if (existing !== undefined) {
    return existing as T
  }
  const def = defFor<T>(ctx, ctx.r.u32())
  const node = def.create()
  ctx.nodes.set(index, node)
  readChunks(ctx, def, node)
  return node
}
