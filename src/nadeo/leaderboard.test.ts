import { describe, expect, test } from 'vitest'
import type { NadeoClient } from './client.ts'
import { campaignMaps, mapLeaderboard } from './leaderboard.ts'

const client: NadeoClient = {
  campaigns: async () => [],
  mapInfo: async () => [],
  leaderboard: async (mapUid, length) =>
    Array.from({ length }, (_, i) => ({
      position: i + 1,
      accountId: `${mapUid}-a${i + 1}`,
      score: 19988 + i,
      timestamp: 1761065295 + i,
    })),
  mapInfoById: async () => [],
  mapRecords: async (mapId, accountIds) =>
    accountIds
      .filter((a) => !a.endsWith('a2'))
      .map((accountId) => ({
        accountId,
        mapRecordId: `r-${accountId}`,
        mapId,
        timeMs: 19990,
        timestamp: '2026-10-21T16:48:15+00:00',
        url: `https://core.trackmania.nadeo.live/mapRecords/r-${accountId}/replay`,
        removed: false,
      })),
  mapRecord: async () => {
    throw new Error('unused')
  },
  displayNames: async (ids) => Object.fromEntries(ids.slice(0, 1).map((id) => [id, `Name ${id}`])),
  download: async () => new Uint8Array(),
}

describe('mapLeaderboard', () => {
  test('joins the top with each account record and display name, accounts without a record are dropped', async () => {
    const records = await mapLeaderboard(client, 'u1', 'm1', 3)
    expect(records).toEqual([
      {
        position: 1,
        accountId: 'u1-a1',
        player: 'Name u1-a1',
        timeMs: 19990,
        timestamp: '2026-10-21T16:48:15+00:00',
        recordId: 'r-u1-a1',
        url: 'https://core.trackmania.nadeo.live/mapRecords/r-u1-a1/replay',
      },
      {
        position: 3,
        accountId: 'u1-a3',
        player: 'u1-a3',
        timeMs: 19990,
        timestamp: '2026-10-21T16:48:15+00:00',
        recordId: 'r-u1-a3',
        url: 'https://core.trackmania.nadeo.live/mapRecords/r-u1-a3/replay',
      },
    ])
  })

  test('an empty leaderboard asks for nothing else', async () => {
    let calls = 0
    const empty: NadeoClient = {
      ...client,
      leaderboard: async () => [],
      mapRecords: async () => {
        calls++
        return []
      },
      displayNames: async () => {
        calls++
        return {}
      },
    }
    expect(await mapLeaderboard(empty, 'u1', 'm1', 25)).toEqual([])
    expect(calls).toBe(0)
  })
})

describe('campaignMaps', () => {
  test('returns the campaign maps in playlist order, uids the api does not know are dropped', async () => {
    const c: NadeoClient = {
      ...client,
      mapInfo: async (uids) =>
        [...uids]
          .reverse()
          .filter((uid) => uid !== 'u2')
          .map((uid) => ({ mapUid: uid, mapId: `id-${uid}`, name: `Map ${uid}` })),
    }
    const maps = await campaignMaps(c, { id: 1, name: 'Fall 2026', mapUids: ['u1', 'u2', 'u3'] })
    expect(maps).toEqual([
      { mapUid: 'u1', mapId: 'id-u1', name: 'Map u1' },
      { mapUid: 'u3', mapId: 'id-u3', name: 'Map u3' },
    ])
  })
})
