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

// real tmx records kept for parser regressions, no dump goldens
export const CORPUS_FIXTURES = {
  jdon: 'jdon._(0053742)_lapislazuli.Ghost.Gbx',
  propanoia: 'propanoia_(0057655)_shards-of-eternity.Ghost.Gbx',
  deleteCheatWRs: 'DeleteCheatWRs_(0019869)_fall-2026-01.Ghost.Gbx',
  // removed record on a car transformation map, the car spans six record data elements
  kopatych: 'Kopatych.xDD_(0027690)_winter-2024-10.Ghost.Gbx',
  // removed record whose car never left the start, the finish fired without a drive
  blackpro: 'Blackpro921OG_(0048142)_summer-2020-19.Ghost.Gbx',
  // removed record with a checkpoint passed 1.5 s before the start and a 3.6 s race
  tommac1n0: 'tommac1n0_(0003644)_spring-2026-08.Ghost.Gbx',
  // removed record that finishes a 7 s map in 1.5 s after 16 m of driving
  pixeldani: 'PixelDani_(0001477)_training-01.Ghost.Gbx',
} as const

export type FixtureName = keyof typeof FIXTURES
export type CorpusFixtureName = keyof typeof CORPUS_FIXTURES

function readBytes(file: string): Uint8Array {
  const buf = readFileSync(fileURLToPath(new URL(`../../fixtures/${file}`, import.meta.url)))
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function fixturePath(name: FixtureName): string {
  return fileURLToPath(new URL(`../../fixtures/${FIXTURES[name]}`, import.meta.url))
}

export function loadFixture(name: FixtureName): Uint8Array {
  return readBytes(FIXTURES[name])
}

export function loadCorpusFixture(name: CorpusFixtureName): Uint8Array {
  return readBytes(CORPUS_FIXTURES[name])
}
