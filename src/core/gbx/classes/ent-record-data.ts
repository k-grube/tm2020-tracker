import type { ClassDef } from '../node.ts'
import type { EntRecordData } from '../../model.ts'
import { UnsupportedError } from '../../io/errors.ts'

export const ENT_RECORD_DATA_CLASS = 0x0911f000

export const EntRecordDataDef: ClassDef<EntRecordData> = {
  classId: ENT_RECORD_DATA_CLASS,
  create: () => ({ version: 0, uncompressedSize: 0, compressed: new Uint8Array(0) }),
  chunks: new Map([
    [
      0x0911f000,
      (ctx, node) => {
        node.version = ctx.r.u32()
        if (node.version < 5) {
          throw new UnsupportedError(`ent record data version ${node.version}, need zlib form (5+)`)
        }
        node.uncompressedSize = ctx.r.i32()
        node.compressed = ctx.r.data()
      },
    ],
  ]),
}
