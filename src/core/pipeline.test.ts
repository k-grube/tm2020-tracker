import { describe, expect, test } from 'vitest'
import { inflateSync } from 'node:zlib'
import { analyzeBytes } from './pipeline.ts'
import { analyzeFiles } from './signals/index.ts'
import { fakeCtx } from './signals/test-util.ts'
import type { Inflate } from './model.ts'
import { minimalGhostBody, uncompressedGbx } from '../test/minimal-ghost.ts'
import { loadFixture } from '../test/fixtures.ts'
import { patchSkippable, uncompressedCopy } from '../test/gbx-mutate.ts'

// one nonzero byte behind the input stream
function trailingInputByte(bytes: Uint8Array): Uint8Array {
  return patchSkippable(bytes, 0x0309201d, (p) => {
    const out = new Uint8Array(p.length + 1)
    out.set(p)
    out[p.length] = 0xff
    new DataView(out.buffer).setUint32(24, p.length - 28 + 1, true)
    return out
  })
}

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

describe('decode failures', () => {
  test('a trailing input byte fires decode_failure and needs review', async () => {
    const bytes = trailingInputByte(loadFixture('slidrz'))
    const r = (await analyzeBytes([{ name: 'x', bytes }], null, nodeInflate)).files[0]!
    const s = r.signals.find((x) => x.id === 'decode_failure')!
    expect(s.level).toBe('absolute')
    expect(s.fired).toBe(true)
    expect(s.evidence.join(' ')).toMatch(/trailing/)
    expect(r.summary.needsHumanReview).toBe(true)
  })

  test('a file that is not gbx is an error without review', async () => {
    const files = [{ name: 'x', bytes: new Uint8Array([1, 2, 3]) }]
    const r = (await analyzeBytes(files, null, nodeInflate)).files[0]!
    expect(r.login).toBe('')
    expect(r.summary.needsHumanReview).toBe(false)
  })

  test('a body that fails to parse is an error that needs review', async () => {
    const bytes = uncompressedCopy(loadFixture('slidrz')).slice(0, 2000)
    const r = (await analyzeBytes([{ name: 'x', bytes }], null, nodeInflate)).files[0]!
    expect(r.login).toBe('')
    expect(r.summary.needsHumanReview).toBe(true)
  })

  test('decode_failure is not applicable without inputs or record data', () => {
    const ctx = fakeCtx({ ghost: { inputs: [], recordData: null } })
    const s = analyzeFiles([ctx], null).files[0]!.signals.find((x) => x.id === 'decode_failure')!
    expect(s.applicable).toBe(false)
    expect(s.fired).toBe(false)
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
