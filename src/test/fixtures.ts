import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const FIXTURES = {
  slidrz: 'Slidrz_(00_24_794)_symmetrical-spring-2025-03.Ghost.Gbx',
  tmio: '2f3e488b-31d7-48b3-bc91-7a255b5484cc.Ghost.gbx',
  tmxReplay: 'tmx-151406.Replay.Gbx',
  localReplay: 'local-2026-10-27.Replay.Gbx',
  localPbReplay: 'local-2026-10-27-pb.Replay.Gbx',
} as const

// current-build replays driven 2026-10-27, race time 21278 ms, wall time about the same
export const LOCAL_REPLAY_RACE_TIME_MS = 21278

export type FixtureName = keyof typeof FIXTURES

export function fixturePath(name: FixtureName): string {
  return fileURLToPath(new URL(`../../fixtures/${FIXTURES[name]}`, import.meta.url))
}

export function loadFixture(name: FixtureName): Uint8Array {
  const buf = readFileSync(fixturePath(name))
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}
