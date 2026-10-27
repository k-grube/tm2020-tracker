import type { ByteReader } from '../io/byte-reader.ts'
import { UnsupportedError } from '../io/errors.ts'

// lookback string table, one per file, shared by header chunks and body
export class IdState {
  version: number | null = null
  seen: string[] = []
}

const NULL_ID = 0xffffffff
const FLAG_MASK = 0xc0000000
const INDEX_MASK = 0x3fffffff

export function readId(r: ByteReader, s: IdState): string {
  if (s.version === null) {
    s.version = r.u32()
    if (s.version < 3) {
      throw new UnsupportedError(`lookback id version ${s.version}`)
    }
  }
  const index = r.u32()
  if (index === NULL_ID) {
    return ''
  }
  // >>> 0 keeps the high bit unsigned, & alone yields a negative int32
  const flags = (index & FLAG_MASK) >>> 0
  if (flags !== 0x40000000 && flags !== 0x80000000) {
    return String(index)
  }
  const n = index & INDEX_MASK
  if (n === 0) {
    const str = r.string()
    s.seen.push(str)
    return str
  }
  const ref = s.seen[n - 1]
  if (ref === undefined) {
    throw new UnsupportedError(`lookback id reference ${n} before definition`)
  }
  return ref
}

export interface Ident {
  id: string
  collection: string
  author: string
}

export function readIdent(r: ByteReader, s: IdState): Ident {
  const id = readId(r, s)
  const collection = readId(r, s)
  const author = readId(r, s)
  return { id, collection, author }
}

export interface PackDesc {
  filePath: string
  locatorUrl: string
  checksum: Uint8Array | null
}

export function readPackDesc(r: ByteReader): PackDesc {
  const version = r.u8()
  const checksum = version >= 3 ? r.bytes(32) : null
  const filePath = r.string()
  const locatorUrl = (filePath.length > 0 && version >= 1) || version >= 3 ? r.string() : ''
  return { filePath, locatorUrl, checksum }
}
