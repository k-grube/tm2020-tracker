const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
const str = (s: string) => {
  const b = Array.from(new TextEncoder().encode(s))
  return [...u32(b.length), ...b]
}
const END = u32(0xfacade01)

// smallest ghost the reader accepts: no inputs, no race time, no record data
export function minimalGhostBody(login = 'login'): number[] {
  return [
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
    ...str(login),
    ...u32(0x03092010),
    ...u32(0x40000000),
    ...str('abcdefghijklmnopqrstuvwxyz1'),
    ...u32(0x0309201c),
    ...new Array<number>(32).fill(0),
    ...END,
  ]
}

// uncompressed Gbx file with no header chunks around the given body
export function uncompressedGbx(classId: number, body: number[]): Uint8Array {
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
    ...u32(classId),
    ...u32(0),
    ...u32(2),
    ...u32(0),
    ...body,
  ])
}

export function minimalGhostGbx(login = 'login'): Uint8Array {
  return uncompressedGbx(0x03092000, minimalGhostBody(login))
}
