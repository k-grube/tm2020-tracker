import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { buildContext, detectDevice } from './context.ts'
import { summarize } from './index.ts'
import { metadata } from './metadata.ts'
import { parseGbx } from '../parse.ts'
import type { Inflate } from '../model.ts'
import type { FileContext, SignalResult } from './types.ts'
import { loadFixture } from '../../test/fixtures.ts'

const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

describe('detectDevice', () => {
  test('keyboard when only -127, 0, 127 appear', () => {
    expect(detectDevice(Int8Array.from([0, 127, 127, 0, -127, 0]))).toBe('keyboard')
  })

  test('pad when many distinct values appear', () => {
    expect(detectDevice(Int8Array.from(Array.from({ length: 40 }, (_, i) => i * 3 - 60)))).toBe(
      'pad',
    )
  })

  test('mixed when a few analog values appear', () => {
    expect(detectDevice(Int8Array.from([0, 127, -127, 40, 41, 42]))).toBe('mixed')
  })

  test('unknown on null or empty', () => {
    expect(detectDevice(null)).toBe('unknown')
    expect(detectDevice(new Int8Array(0))).toBe('unknown')
  })
})

describe('buildContext', () => {
  test('slidrz has events, steer series, samples and a device', async () => {
    const ctx = await buildContext('slidrz', parseGbx(loadFixture('slidrz')), nodeInflate)
    expect(ctx.name).toBe('slidrz')
    expect(ctx.ghost.raceTimeMs).toBe(24794)
    expect(ctx.events.length).toBeGreaterThan(100)
    expect(ctx.steer!.length).toBe(ctx.ghost.inputs[0]!.ticks)
    expect(ctx.samples!.length).toBeGreaterThan(200)
    expect(['keyboard', 'pad', 'mixed']).toContain(ctx.device)
  })
})

const result = (over: Partial<SignalResult>): SignalResult => ({
  id: 'metadata',
  level: 'info',
  applicable: true,
  fired: false,
  value: null,
  unit: '',
  evidence: [],
  references: [],
  ...over,
})

describe('summarize', () => {
  test('absolute fired forces review', () => {
    const s = summarize([result({ id: 'same_tick_toggle', level: 'absolute', fired: true })])
    expect(s.absoluteFired).toEqual(['same_tick_toggle'])
    expect(s.needsHumanReview).toBe(true)
  })

  test('one relative outside does not force review, two do', () => {
    const one = summarize([result({ id: 'input_density', level: 'relative', fired: true })])
    expect(one.relativeOutside).toEqual(['input_density'])
    expect(one.needsHumanReview).toBe(false)
    const two = summarize([
      result({ id: 'input_density', level: 'relative', fired: true }),
      result({ id: 'steer_spikes_per_sec', level: 'relative', fired: true }),
    ])
    expect(two.needsHumanReview).toBe(true)
  })

  test('one empirical signal is enough for review', () => {
    const s = summarize([result({ id: 'same_tick_toggle', level: 'empirical', fired: true })])
    expect(s.empiricalFired).toEqual(['same_tick_toggle'])
    expect(s.absoluteFired).toEqual([])
    expect(s.needsHumanReview).toBe(true)
  })

  test('nothing fired is clean', () => {
    const s = summarize([result({ id: 'wall_time_ratio', level: 'relative', fired: false })])
    expect(s).toEqual({
      absoluteFired: [],
      empiricalFired: [],
      relativeOutside: [],
      needsHumanReview: false,
    })
  })
})

// share of samples inside the race whose steer and gas bytes equal the input at that tick or the one before
function matchShare(ctx: FileContext): { steer: number; gas: number } {
  const offset = ctx.ghost.inputs[0]!.startOffsetMs ?? 0
  const raceTicks = Math.floor((ctx.ghost.raceTimeMs! - offset) / 10)
  const ticks = ctx.steer!.length
  const gas = new Uint8Array(ticks)
  const brake = new Uint8Array(ticks)
  let g = 0
  let b = 0
  let next = 0
  const events = ctx.events.filter((e) => e.kind === 'gas' || e.kind === 'brake')
  for (let t = 0; t < ticks; t++) {
    while (next < events.length && events[next]!.tick <= t) {
      if (events[next]!.kind === 'gas') {
        g = events[next]!.value
      } else {
        b = events[next]!.value
      }
      next++
    }
    gas[t] = g
    brake[t] = b
  }
  const eff = (t: number) => (gas[t] && !brake[t] ? true : false)
  let n = 0
  let steerOk = 0
  let gasOk = 0
  for (const s of ctx.samples!) {
    const tick = Math.round((s.timeMs - offset) / 10)
    if (tick < 2 || tick >= ticks || tick > raceTicks) {
      continue
    }
    n++
    if (s.steer === ctx.steer![tick] || s.steer === ctx.steer![tick - 1]) {
      steerOk++
    }
    if (s.gas === eff(tick) || s.gas === eff(tick - 1)) {
      gasOk++
    }
  }
  return { steer: steerOk / n, gas: gasOk / n }
}

describe('sample input bytes', () => {
  test.each(['slidrz', 'tmio'] as const)(
    'steer and gas follow the input stream on %s',
    async (name) => {
      const ctx = await buildContext(name, parseGbx(loadFixture(name)), nodeInflate)
      const share = matchShare(ctx)
      expect(share.steer).toBeGreaterThanOrEqual(0.99)
      expect(share.gas).toBeGreaterThanOrEqual(0.99)
    },
  )
})

describe('buildContext, partial decode failures', () => {
  test('undecodable record data leaves samples null and adds a warning', async () => {
    const parsed = parseGbx(loadFixture('slidrz'))
    parsed.ghosts[0]!.recordData!.compressed.fill(0xff, 100, 150)
    const ctx = await buildContext('corrupt', parsed, nodeInflate)
    expect(ctx.samples).toBeNull()
    expect(ctx.events.length).toBeGreaterThan(100)
    expect(parsed.warnings.join(' ')).toMatch(/record data/)
    expect(ctx.samplesError).toMatch(/./)
    expect(ctx.inputError).toBeNull()
  })

  test('unsupported input encoding leaves events empty and adds a warning', async () => {
    const parsed = parseGbx(loadFixture('slidrz'))
    const input = parsed.ghosts[0]!.inputs[0]!
    input.data = new Uint8Array([0x30, 0, 0, 0, 0])
    input.ticks = 2
    const ctx = await buildContext('float', parsed, nodeInflate)
    expect(ctx.events).toEqual([])
    expect(ctx.steer).toBeNull()
    expect(ctx.decodedTicks).toBeNull()
    expect(ctx.samples!.length).toBeGreaterThan(200)
    expect(parsed.warnings.join(' ')).toMatch(/float steer/)
    expect(ctx.inputError).toMatch(/float steer/)
    expect(ctx.samplesError).toBeNull()
  })
})

describe('ghost pick in replays', () => {
  test('replay with two ghosts analyzes the author ghost', async () => {
    const base = parseGbx(loadFixture('localPbReplay'))
    const author = base.ghosts[0]!
    const decoy = { ...author, login: 'someone-else', raceTimeMs: 1000 }
    const ctx = await buildContext('x', { ...base, ghosts: [decoy, author] }, nodeInflate)
    expect(base.replay!.login).toBe(author.login)
    expect(ctx.ghost.login).toBe(author.login)
    expect(ctx.ghost.raceTimeMs).toBe(author.raceTimeMs)
    const lines = metadata(ctx, null).evidence
    expect(lines).toContainEqual(expect.stringMatching(/^ghosts 2, analyzed #2/))
    expect(lines).toContainEqual(expect.stringMatching(/^ghost #1 someone-else 1000 ms/))
  })

  test('replay header without login takes the first ghost', async () => {
    const base = parseGbx(loadFixture('localPbReplay'))
    const decoy = { ...base.ghosts[0]!, login: 'someone-else' }
    const parsed = {
      ...base,
      replay: { ...base.replay!, login: null },
      ghosts: [decoy, base.ghosts[0]!],
    }
    const ctx = await buildContext('x', parsed, nodeInflate)
    expect(ctx.ghost.login).toBe('someone-else')
  })
})
