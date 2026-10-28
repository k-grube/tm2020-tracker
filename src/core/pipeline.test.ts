import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { analyzeBytes } from './pipeline.ts'
import { analyzeFiles } from './signals/index.ts'
import { fakeCtx } from './signals/test-util.ts'
import type { Inflate } from './model.ts'
import { minimalGhostBody, uncompressedGbx } from '../test/minimal-ghost.ts'
import { loadFixture } from '../test/fixtures.ts'

const nodeInflate: Inflate = (c) => new Uint8Array(inflateSync(c))

const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

// skippable 0x01D chunk declaring far more ticks than its one data byte can hold
function hostileTicksGhost(): Uint8Array {
  const payload = [
    ...u32(12),
    ...u32(1),
    ...u32(12),
    ...u32(0),
    ...u32(0),
    ...u32(0x7fffffff),
    ...u32(1),
    0,
  ]
  const chunk = [...u32(0x0309201d), ...u32(0x534b4950), ...u32(payload.length), ...payload]
  const body = minimalGhostBody()
  body.splice(body.length - 4, 0, ...chunk)
  return uncompressedGbx(0x03092000, body)
}

describe('analyzeBytes', () => {
  test('a ghost declaring 2^31 input ticks is an error report and the batch continues', async () => {
    const files = [
      { name: 'hostile', bytes: hostileTicksGhost() },
      { name: 'slidrz', bytes: loadFixture('slidrz') },
    ]
    const started = Date.now()
    const report = await analyzeBytes(files, null, nodeInflate)
    expect(Date.now() - started).toBeLessThan(3000)
    expect(report.files[0]!.login).toBe('')
    expect(report.files[0]!.signals[0]!.evidence[0]).toMatch(/ticks/)
    expect(report.files[1]!.login).toBe('u8IfOUGVSWOUnBrRSa-lFg')
    expect(report.files[1]!.signals.length).toBeGreaterThan(5)
  })
})

describe('analyzeFiles', () => {
  test('a detector throwing on one file leaves the other reports intact', () => {
    const bad = fakeCtx({ name: 'bad' })
    Object.defineProperty(bad, 'events', {
      get() {
        throw new Error('boom')
      },
    })
    const good = fakeCtx({ name: 'good', ghost: { login: 'ok' } })
    const report = analyzeFiles([bad, good], null)
    expect(report.files[0]!.name).toBe('bad')
    expect(report.files[0]!.login).toBe('')
    expect(report.files[0]!.signals[0]!.evidence[0]).toMatch(/boom/)
    expect(report.files[1]!.login).toBe('ok')
    expect(report.files[1]!.signals.length).toBeGreaterThan(5)
  })
})
