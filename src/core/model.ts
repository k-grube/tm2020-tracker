import type { Ident } from './gbx/ids.ts'

// zlib inflate injected by the platform (node:zlib in the cli, DecompressionStream in the browser)
export type Inflate = (
  compressed: Uint8Array,
  uncompressedSize: number,
) => Uint8Array | Promise<Uint8Array>

// CPlugEntRecordData kept compressed until samples are needed
export interface EntRecordData {
  version: number
  uncompressedSize: number
  compressed: Uint8Array
}

// vehicle sample from CPlugEntRecordData, position in map meters, speed in m/s
export interface Sample {
  timeMs: number
  position: [number, number, number]
  speedMs: number
}

export interface Checkpoint {
  timeMs: number
  stuntsScore: number | null
}

export interface PlayerInputData {
  version: number
  u01: number
  startOffsetMs: number | null
  ticks: number
  data: Uint8Array
}

export type InputKind =
  | 'steer'
  | 'gas'
  | 'brake'
  | 'horn'
  | 'jump'
  | 'freeLook'
  | 'actionSlot'
  | 'respawn'
  | 'secondaryRespawn'
  | 'mouse'

// steer -127..127, binary kinds 0/1, actionSlot value = slot with value2 = pressed, mouse value = x with value2 = y
export interface InputEvent {
  tick: number
  timeMs: number
  kind: InputKind
  value: number
  value2?: number
}

export interface WallTime {
  startUnixSec: number
  endUnixSec: number
  source: '02C' | '02D'
}

export interface Validation {
  exeVersion: string
  exeChecksum: number
  osKind: number
  cpuKind: number
  titleId: string
  validationSeed: number
  raceSettings: string
}

export interface ReplayHeader {
  version: number
  mapInfo: Ident
  timeMs: number | null
  nickname: string
  login: string | null
  titleId: string | null
}

export interface ParsedFile {
  kind: 'ghost' | 'replay'
  ghosts: Ghost[]
  replay: ReplayHeader | null
  warnings: string[]
}

export interface Ghost {
  nickname: string
  login: string
  zone: string | null
  clubTag: string | null
  trigram: string | null
  recordingContext: string | null
  playerModel: Ident
  mapUid: string
  ghostUid: string
  raceTimeMs: number | null
  respawns: number | null
  checkpoints: Checkpoint[]
  ghostVersion: number | null
  inputs: PlayerInputData[]
  wallTime: WallTime | null
  validation: Validation | null
  recordData: EntRecordData | null
  rawChunks: Map<number, Uint8Array>
  unknownChunks: number[]
}
