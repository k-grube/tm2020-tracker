import { ByteReader } from '../io/byte-reader.ts'
import { ParseError, UnsupportedError } from '../io/errors.ts'

export interface HeaderChunk {
  id: number
  heavy: boolean
  data: Uint8Array
}

export interface GbxHeader {
  version: number
  format: 'B' | 'T'
  refTableCompressed: boolean
  bodyCompressed: boolean
  classId: number
  headerChunks: HeaderChunk[]
  numNodes: number
  bodyOffset: number
}

const MAGIC = [0x47, 0x42, 0x58]
const HEAVY_FLAG = 0x80000000

export function parseHeader(bytes: Uint8Array): GbxHeader {
  const r = new ByteReader(bytes)
  for (const m of MAGIC) {
    if (r.u8() !== m) {
      throw new ParseError('not a Gbx file', 0)
    }
  }
  const version = r.u16()
  if (version < 6) {
    throw new UnsupportedError(`gbx version ${version}`)
  }
  const format = String.fromCharCode(r.u8())
  if (format !== 'B') {
    throw new UnsupportedError(`gbx format ${format}`)
  }
  const refTableCompressed = String.fromCharCode(r.u8()) === 'C'
  const bodyCompressed = String.fromCharCode(r.u8()) === 'C'
  r.u8()
  const classId = r.u32()
  const headerChunks = readUserData(r)
  const numNodes = r.u32()
  const numExternalNodes = r.u32()
  if (numExternalNodes > 0) {
    throw new UnsupportedError('external references')
  }
  return {
    version,
    format,
    refTableCompressed,
    bodyCompressed,
    classId,
    headerChunks,
    numNodes,
    bodyOffset: r.pos,
  }
}

function readUserData(r: ByteReader): HeaderChunk[] {
  const size = r.u32()
  if (size === 0) {
    return []
  }
  const start = r.pos
  const numChunks = r.u32()
  if (numChunks > 255) {
    throw new ParseError(`header chunk count ${numChunks}`, r.pos - 4)
  }
  const table: { id: number; size: number; heavy: boolean }[] = []
  let total = 4
  for (let i = 0; i < numChunks; i++) {
    const id = r.u32()
    const sizeField = r.u32()
    const heavy = (sizeField & HEAVY_FLAG) !== 0
    const chunkSize = sizeField & ~HEAVY_FLAG
    table.push({ id, size: chunkSize, heavy })
    total += 8 + chunkSize
  }
  if (total !== size) {
    throw new ParseError(`header chunk sizes sum to ${total}, user data size ${size}`, start)
  }
  return table.map((c) => ({ id: c.id, heavy: c.heavy, data: r.bytes(c.size) }))
}
