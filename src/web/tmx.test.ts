import { describe, expect, test } from 'vitest'
import { parseRecords, recordsUrl, tmxMapId, tmxRecordDownloadUrl } from './tmx.ts'

describe('tmxMapId', () => {
  test('map links in their usual shapes and a bare id', () => {
    for (const s of [
      '151406',
      ' 151406 ',
      'https://trackmania.exchange/maps/151406',
      'https://trackmania.exchange/maps/151406/some-name',
      'https://www.trackmania.exchange/mapshow/151406',
      'https://trackmania.exchange/s/tr/151406',
      'trackmania.exchange/maps/151406?x=1',
    ]) {
      expect(tmxMapId(s), s).toBe(151406)
    }
  })

  test('anything else is null', () => {
    for (const s of [
      '',
      'abc',
      'https://example.com/maps/151406',
      'https://trackmania.exchange/users/1',
    ]) {
      expect(tmxMapId(s), s).toBeNull()
    }
  })
})

describe('urls', () => {
  test('records listing and record download', () => {
    expect(recordsUrl(151406, 25)).toBe(
      'https://trackmania.exchange/api/maps/getonlinerecords?mapId=151406&count=25',
    )
    expect(tmxRecordDownloadUrl('e9beeecb-c76a-44dc-93db-e733acbd3998')).toBe(
      'https://trackmania.exchange/getonlinerecord/e9beeecb-c76a-44dc-93db-e733acbd3998',
    )
  })
})

describe('parseRecords', () => {
  test('flattens tmx online records', () => {
    const json = {
      Results: [
        {
          Position: 1,
          RecordTime: 19332,
          DisplayName: 'nappael1',
          AccountId: 'a',
          RecordId: 'r1',
          RecordAt: '2024-01-18T13:05:53',
        },
        {
          Position: 2,
          RecordTime: 19400,
          DisplayName: 'B',
          AccountId: 'b',
          RecordId: 'r2',
          RecordAt: '2024-02-01T00:00:00',
        },
      ],
    }
    expect(parseRecords(json)).toEqual([
      {
        position: 1,
        player: 'nappael1',
        timeMs: 19332,
        timestamp: '2024-01-18T13:05:53',
        recordId: 'r1',
      },
      { position: 2, player: 'B', timeMs: 19400, timestamp: '2024-02-01T00:00:00', recordId: 'r2' },
    ])
  })
})

describe('parseRecords limit', () => {
  test('tmx ignores count and always returns 50, the parser cuts to the limit', () => {
    const json = {
      Results: Array.from({ length: 50 }, (_, i) => ({
        Position: i + 1,
        RecordTime: 1000 + i,
        DisplayName: `p${i}`,
        AccountId: 'a',
        RecordId: `r${i}`,
        RecordAt: 't',
      })),
    }
    expect(parseRecords(json)).toHaveLength(25)
    expect(parseRecords(json, 3).map((r) => r.position)).toEqual([1, 2, 3])
  })
})
