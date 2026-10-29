import type { Ghost, InputEvent, Sample } from '../model.ts'
import type { Baseline, BaselineStat, Device, FileContext, SignalId } from './types.ts'

// every fake ghost is its own recording unless a test says otherwise
let nextGhostUid = 1

export function fakeGhost(over: Partial<Ghost> = {}): Ghost {
  return {
    nickname: 'nick',
    login: 'login',
    zone: null,
    clubTag: null,
    trigram: null,
    recordingContext: null,
    playerModel: { id: 'CarSport', collection: '26', author: 'Nadeo' },
    mapUid: 'map-uid',
    ghostUid: `ghost-uid-${nextGhostUid++}`,
    raceTimeMs: 25000,
    respawns: 0,
    stuntScore: 0,
    gameRules: null,
    spawnLandmark: null,
    scope: null,
    entityIndices: [],
    checkpoints: [{ timeMs: 25000, stuntsScore: null }],
    checkpoints01b: null,
    checkpoints02b: null,
    ghostVersion: null,
    inputs: [{ version: 12, u01: 0, startOffsetMs: 0, ticks: 2500, data: new Uint8Array(0) }],
    wallTime: null,
    validation: null,
    validation025: null,
    recordingId: null,
    recordData: null,
    rawChunks: new Map(),
    unknownChunks: [],
    ...over,
  }
}

export function fakeCtx(
  over: Partial<Omit<FileContext, 'ghost'>> & { ghost?: Partial<Ghost> } = {},
): FileContext {
  const ghost = fakeGhost(over.ghost)
  const { ghost: _ignored, ...rest } = over
  return {
    name: 'fake',
    parsed: { kind: 'ghost', ghosts: [ghost], replay: null, warnings: [] },
    ghost,
    leaderboard: null,
    events: [],
    steer: null,
    samples: null,
    checkpointRecords: null,
    decodedTicks: null,
    inputError: null,
    samplesError: null,
    firstVehicleTick: null,
    kinds: [],
    kindTicks: [],
    minSteer: null,
    device: 'unknown',
    ...rest,
  }
}

export function fakeBaseline(
  id: SignalId,
  device: Device,
  stat: Partial<BaselineStat> & Pick<BaselineStat, 'median' | 'q1' | 'q3'>,
): Baseline {
  return {
    builtAt: '2026-10-27T00:00:00.000Z',
    files: 100,
    ranks: [10, 50],
    chunkPresence: {},
    signals: { [id]: { [device]: { n: 100, ...stat } } },
    builds: {},
  }
}

export function steerEvents(values: number[], everyTicks = 1): InputEvent[] {
  return values.map((value, i) => ({
    tick: i * everyTicks,
    timeMs: i * everyTicks * 10,
    kind: 'steer',
    value,
  }))
}

export function fakeSamples(positions: [number, number, number][], stepMs = 10): Sample[] {
  return positions.map((position, i) => ({
    timeMs: i * stepMs,
    position,
    speedMs: 10,
    simCoef: 1,
    steer: 0,
    gas: true,
    brake: false,
    state: null,
  }))
}
