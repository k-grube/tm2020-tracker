import { describe, expect, test } from 'vitest'
import { isGbx, proxiedUrl, recordUrls, tmxRecordUrl } from './proxy.ts'

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

describe('recordUrls', () => {
  const uuid = '6855da8e-0a70-487a-a3fc-a1d0691e31bc'
  const tmx = `https://trackmania.exchange/getonlinerecord/${uuid}`
  const tmio = `https://trackmania.io/api/download/ghost/${uuid}`

  test('a bare uuid tries tmx then trackmania.io', () => {
    expect(recordUrls(` ${uuid} `)).toEqual([tmx, tmio])
  })

  test('a bare number is a tmx uploaded replay', () => {
    expect(recordUrls('151406')).toEqual(['https://trackmania.exchange/recordgbx/151406'])
  })

  test('known download urls are rebuilt from their id, not passed through', () => {
    expect(recordUrls(tmio)).toEqual([tmio])
    expect(recordUrls(`http://www.trackmania.exchange/getonlinerecord/${uuid}?x=1`)).toEqual([tmx])
    expect(recordUrls('https://trackmania.exchange/recordgbx/151406/')).toEqual([
      'https://trackmania.exchange/recordgbx/151406',
    ])
    expect(recordUrls(`HTTPS://TRACKMANIA.IO/api/download/ghost/${uuid}`)).toEqual([tmio])
  })

  test('anything else is empty', () => {
    for (const bad of [
      '',
      'hello',
      `https://example.com/getonlinerecord/${uuid}`,
      'https://trackmania.exchange/maps/151406',
      `https://trackmania.io/#/leaderboard/${uuid}`,
      `https://trackmania.exchange/getonlinerecord/${uuid}/../x`,
    ]) {
      expect(recordUrls(bad), bad).toEqual([])
    }
  })
})

describe('isGbx', () => {
  test('checks the GBX magic', () => {
    expect(isGbx(new Uint8Array([0x47, 0x42, 0x58, 6, 0]))).toBe(true)
    expect(isGbx(new TextEncoder().encode('<!DOCTYPE html>'))).toBe(false)
    expect(isGbx(new Uint8Array(0))).toBe(false)
  })
})
