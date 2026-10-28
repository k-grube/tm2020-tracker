import { describe, expect, test } from 'vitest'
import {
  campaignUrl,
  campaignsUrl,
  filterRecords,
  leaderboardUrl,
  parseCampaign,
  parseCampaigns,
  parseLeaderboard,
  recordGhostUrl,
  type LeaderboardRecord,
} from './tmio.ts'

describe('trackmania.io urls', () => {
  test('campaign list, campaign, leaderboard', () => {
    expect(campaignsUrl()).toBe('https://trackmania.io/api/campaigns/seasonal/0')
    expect(campaignUrl(157584)).toBe('https://trackmania.io/api/campaign/seasonal/157584')
    expect(leaderboardUrl('ypPmohQofd72MyTsIsijKfrJH98', 25)).toBe(
      'https://trackmania.io/api/leaderboard/map/ypPmohQofd72MyTsIsijKfrJH98?offset=0&length=25',
    )
  })
})

describe('parsers', () => {
  test('parseCampaigns keeps official campaigns, newest first as served', () => {
    const json = {
      page: 0,
      pageCount: 1,
      campaigns: [
        { official: true, seasonal: true, id: 157584, name: 'Fall 2026', timestamp: 1790866800 },
        { official: true, seasonal: true, id: 150000, name: 'Summer 2026', timestamp: 1780000000 },
        { official: false, seasonal: false, id: 1, name: 'Club thing', timestamp: 1 },
      ],
    }
    expect(parseCampaigns(json)).toEqual([
      { id: 157584, name: 'Fall 2026' },
      { id: 150000, name: 'Summer 2026' },
    ])
  })

  test('parseCampaign returns the playlist maps in order', () => {
    const json = {
      name: 'Fall 2026',
      playlist: [
        { name: 'Fall 2026 - 01', mapUid: 'u1', authorScore: 1 },
        { name: 'Fall 2026 - 02', mapUid: 'u2', authorScore: 2 },
      ],
    }
    expect(parseCampaign(json)).toEqual([
      { name: 'Fall 2026 - 01', mapUid: 'u1' },
      { name: 'Fall 2026 - 02', mapUid: 'u2' },
    ])
  })

  test('parseLeaderboard flattens the tops', () => {
    const json = {
      tops: [
        {
          player: { name: 'KarjeN', id: 'p1', zone: {} },
          position: 1,
          time: 19988,
          score: 19988,
          filename: 'x',
          timestamp: '2026-10-21T16:48:15+00:00',
          url: '/api/download/ghost/78969e3c-a39f-4180-bbd3-089152ce98c0',
        },
      ],
      playercount: 5000,
    }
    expect(parseLeaderboard(json)).toEqual([
      {
        position: 1,
        player: 'KarjeN',
        playerId: 'p1',
        timeMs: 19988,
        timestamp: '2026-10-21T16:48:15+00:00',
        ghostId: '78969e3c-a39f-4180-bbd3-089152ce98c0',
      },
    ])
  })

  test('parseLeaderboard drops records without a ghost url', () => {
    const json = {
      tops: [{ player: { name: 'A', id: 'a' }, position: 1, time: 1, timestamp: 't' }],
    }
    expect(parseLeaderboard(json)).toEqual([])
  })
})

describe('filterRecords', () => {
  const rec = (player: string, position: number): LeaderboardRecord => ({
    position,
    player,
    playerId: player,
    timeMs: 1000 + position,
    timestamp: 't',
    ghostId: 'g',
  })
  const records = [rec('KarjeN', 1), rec('hobbi.', 2), rec('LimaTM', 3)]

  test('case-insensitive substring on the player name, empty query keeps all', () => {
    expect(filterRecords(records, 'LIMA').map((r) => r.player)).toEqual(['LimaTM'])
    expect(filterRecords(records, ' hob ').map((r) => r.player)).toEqual(['hobbi.'])
    expect(filterRecords(records, '')).toHaveLength(3)
  })
})

describe('recordGhostUrl', () => {
  test('is the trackmania.io download url for the ghost id', () => {
    expect(recordGhostUrl('78969e3c-a39f-4180-bbd3-089152ce98c0')).toBe(
      'https://trackmania.io/api/download/ghost/78969e3c-a39f-4180-bbd3-089152ce98c0',
    )
  })
})
