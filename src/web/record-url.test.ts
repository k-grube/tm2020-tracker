import { describe, expect, test } from 'vitest'
import { recordUrls, tmxRecordUrl } from './record-url.ts'

describe('tmxRecordUrl', () => {
  test('builds the online record download url', () => {
    expect(tmxRecordUrl('e9beeecb-c76a-44dc-93db-e733acbd3998')).toBe(
      'https://trackmania.exchange/getonlinerecord/e9beeecb-c76a-44dc-93db-e733acbd3998',
    )
  })
})

describe('recordUrls', () => {
  const uuid = '6855da8e-0a70-487a-a3fc-a1d0691e31bc'
  const tmx = `https://trackmania.exchange/getonlinerecord/${uuid}`
  const replay = `https://core.trackmania.nadeo.live/mapRecords/${uuid}/replay`

  test('a bare uuid tries tmx then the nadeo record store', () => {
    expect(recordUrls(` ${uuid} `)).toEqual([tmx, replay])
  })

  test('a bare number is a tmx uploaded replay', () => {
    expect(recordUrls('151406')).toEqual(['https://trackmania.exchange/recordgbx/151406'])
  })

  test('known download urls are rebuilt from their id, not passed through', () => {
    expect(recordUrls(replay)).toEqual([replay])
    expect(recordUrls(`http://www.trackmania.exchange/getonlinerecord/${uuid}?x=1`)).toEqual([tmx])
    expect(recordUrls('https://trackmania.exchange/recordgbx/151406/')).toEqual([
      'https://trackmania.exchange/recordgbx/151406',
    ])
    expect(
      recordUrls(`HTTPS://core.trackmania.nadeo.live/mapRecords/${uuid.toUpperCase()}/replay`),
    ).toEqual([replay])
  })

  test('anything else is empty', () => {
    for (const bad of [
      '',
      'hello',
      `https://example.com/getonlinerecord/${uuid}`,
      'https://trackmania.exchange/maps/151406',
      `https://trackmania.io/api/download/ghost/${uuid}`,
      `https://core.trackmania.nadeo.live/maps/${uuid}/file`,
      `https://trackmania.exchange/getonlinerecord/${uuid}/../x`,
    ]) {
      expect(recordUrls(bad), bad).toEqual([])
    }
  })
})
