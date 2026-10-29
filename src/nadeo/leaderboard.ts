import type { Campaign, MapInfo, NadeoClient } from './client.ts'

export interface LeaderboardRecord {
  position: number
  accountId: string
  player: string
  timeMs: number
  timestamp: string
  recordId: string
  url: string
}

// the world top of a map joined with each account's record (download url, server stamp) and
// display name, the account id stands in for a missing name
export async function mapLeaderboard(
  client: NadeoClient,
  mapUid: string,
  mapId: string,
  count: number,
): Promise<LeaderboardRecord[]> {
  const tops = await client.leaderboard(mapUid, count)
  if (tops.length === 0) {
    return []
  }
  const ids = tops.map((t) => t.accountId)
  const records = new Map((await client.mapRecords(mapId, ids)).map((r) => [r.accountId, r]))
  const names = await client.displayNames(ids)
  const out: LeaderboardRecord[] = []
  for (const t of tops) {
    const r = records.get(t.accountId)
    if (!r) {
      continue
    }
    out.push({
      position: t.position,
      accountId: t.accountId,
      player: names[t.accountId] ?? t.accountId,
      timeMs: r.timeMs,
      timestamp: r.timestamp,
      recordId: r.mapRecordId,
      url: r.url,
    })
  }
  return out
}

// the campaign maps in playlist order, uids the api does not return are dropped
export async function campaignMaps(client: NadeoClient, campaign: Campaign): Promise<MapInfo[]> {
  const info = new Map((await client.mapInfo(campaign.mapUids)).map((m) => [m.mapUid, m]))
  return campaign.mapUids.flatMap((uid) => info.get(uid) ?? [])
}
