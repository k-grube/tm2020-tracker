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

// vehicle sample from CPlugEntRecordData, position in map meters, speed in m/s, steer -127..127 and
// gas/brake as the engine applied them that frame, simCoef the simulation time factor (1 normal,
// sample version 30 on, 1 before), state the rest of the payload (version 23 on)
export interface Sample {
  timeMs: number
  position: [number, number, number]
  speedMs: number
  steer: number
  gas: boolean
  brake: boolean
  simCoef: number
  state: VehicleState | null
}

type Vec3 = [number, number, number]
type Wheels = [number, number, number, number]

// the rest of the vehicle sample. speeds m/s, rpm, wheel rotation rad (FL FR RR
// RL order on every per-wheel field), steerAngle rad, damper -2..2, material the ground contact
// id per wheel, gasPedal 0..1 in quarter steps, discontinuityCount the state's 4 bit counter,
// rotation a quaternion [w, x, y, z], velocity m/s, 0..1 for icing, tireWear, wetness. null on
// versions that do not carry the field
export interface VehicleState {
  frontSpeed: number
  sideSpeed: number
  rpm: number
  wheelRot: Wheels
  steerAngle: number
  turboTime: number
  damper: Wheels
  material: Wheels
  isTurbo: boolean
  wheelsBurning: boolean
  gasPedal: number
  discontinuityCount: number
  topContact: boolean
  rotation: [number, number, number, number]
  velocity: Vec3
  icing: Wheels
  isGroundContact: boolean | null
  gear: number | null
  tireWear: Wheels | null
  wetness: number | null
}

// vehicle event on the car, named by its notice local id, data starts with the u32
// scene uid of the element
export interface RecordEvent {
  timeMs: number
  localId: number
  name: string
  data: Uint8Array
}

// CGameArenaPlayer checkpoint record: tickMs the event tick, timeMs the exact split, flags bit 0
// marks the finish, cpIndex 1-based on 2026 builds only
export interface ArenaCheckpoint {
  tickMs: number
  timeMs: number
  diff1: number
  diff2: number
  landmark: number
  flags: number
  cpIndex: number | null
}

// what CPlugEntRecordData holds for one ghost, stateVersion the car's sample version
export interface DecodedRecord {
  samples: Sample[]
  events: RecordEvent[]
  checkpoints: ArenaCheckpoint[]
  stateVersion: number | null
}

export interface Checkpoint {
  timeMs: number
  stuntsScore: number | null
}

// chunk 01B: race result with the splits as forward deltas, respawns -1 when unset
export interface CheckpointDeltas {
  totalMs: number
  stuntScore: number
  respawns: number
  deltasMs: number[]
}

// chunk 02B: race result with the landmark index each split hit and the spawn landmark
export interface CheckpointLandmarks {
  totalMs: number
  stuntScore: number
  respawns: number
  spawnLandmark: number
  entries: { timeMs: number; landmark: number }[]
}

// chunk 029: where the record was driven
export interface RaceScope {
  scopeType: number
  scopeId: string
  gameMode: string
  customData: string
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

// 02D carries the recording window next to the build, 025 is the same record without it
export interface Validation {
  source: '02D' | '025'
  startUnixSec: number | null
  endUnixSec: number | null
  exeVersion: string
  exeChecksum: number
  osKind: number
  cpuKind: number
  titleId: string
  validationSeed: number
  raceSettings: string
  // 02D only: gameRules packing unknown, spawnLandmark the landmark the run started from, simFlags
  // bit 0 steering wheel sensitivity (the one flag 025 carries), bits 2 and 4 unknown
  gameRules: number | null
  spawnLandmark: number | null
  simFlags: number | null
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
  stuntScore: number | null
  // chunk 02A
  gameRules: number | null
  spawnLandmark: number | null
  scope: RaceScope | null
  // chunk 000: record data elements that belong to this ghost, the first is the car
  entityIndices: number[]
  checkpoints: Checkpoint[]
  checkpoints01b: CheckpointDeltas | null
  checkpoints02b: CheckpointLandmarks | null
  ghostVersion: number | null
  inputs: PlayerInputData[]
  wallTime: WallTime | null
  // 02D when readable, else the 025 copy
  validation: Validation | null
  validation025: Validation | null
  // chunk 026, same across saves of one recording
  recordingId: string | null
  recordData: EntRecordData | null
  rawChunks: Map<number, Uint8Array>
  unknownChunks: number[]
}
