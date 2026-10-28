import { describe, expect, test } from 'vitest'
import { proxiedUrl, tmxRecordUrl } from './proxy.ts'

describe('tmxRecordUrl', () => {
  test('builds the online record download url', () => {
    expect(tmxRecordUrl('e9beeecb-c76a-44dc-93db-e733acbd3998')).toBe(
      'https://trackmania.exchange/getonlinerecord/e9beeecb-c76a-44dc-93db-e733acbd3998',
    )
  })
})

describe('proxiedUrl', () => {
  test('puts the encoded target behind the proxy, with or without a trailing slash', () => {
    const target = 'https://trackmania.exchange/getonlinerecord/abc'
    expect(proxiedUrl('https://p.workers.dev', target)).toBe(
      'https://p.workers.dev/?url=https%3A%2F%2Ftrackmania.exchange%2Fgetonlinerecord%2Fabc',
    )
    expect(proxiedUrl('https://p.workers.dev/', target)).toBe(
      'https://p.workers.dev/?url=https%3A%2F%2Ftrackmania.exchange%2Fgetonlinerecord%2Fabc',
    )
  })
})
