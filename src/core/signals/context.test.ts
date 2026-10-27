import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { buildContext, detectDevice } from './context.ts'
import { summarize } from './index.ts'
import { parseGbx } from '../parse.ts'
import type { Inflate } from '../model.ts'
import type { SignalResult } from './types.ts'
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

  test('nothing fired is clean', () => {
    const s = summarize([result({ id: 'wall_time_ratio', level: 'relative', fired: false })])
    expect(s).toEqual({ absoluteFired: [], relativeOutside: [], needsHumanReview: false })
  })
})
