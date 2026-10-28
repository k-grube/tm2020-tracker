import { tmioGhostUrl } from './proxy.ts'

export const TMIO_BASE = 'https://trackmania.io'
export const TOP_N = 25

export interface Campaign {
  id: number
  name: string
}

export interface CampaignMap {
  name: string
  mapUid: string
}

export interface LeaderboardRecord {
  position: number
  player: string
  playerId: string
  timeMs: number
  timestamp: string
  ghostId: string
}

export const campaignsUrl = (page = 0): string => `${TMIO_BASE}/api/campaigns/seasonal/${page}`
export const campaignUrl = (id: number): string => `${TMIO_BASE}/api/campaign/seasonal/${id}`
export const leaderboardUrl = (mapUid: string, count: number): string =>
  `${TMIO_BASE}/api/leaderboard/map/${encodeURIComponent(mapUid)}?offset=0&length=${count}`

interface CampaignsJson {
  campaigns: { official: boolean; id: number; name: string }[]
}

interface CampaignJson {
  playlist: { name: string; mapUid: string }[]
}

interface LeaderboardJson {
  tops: {
    position: number
    time: number
    timestamp: string
    url?: string
    player: { name: string; id: string }
  }[]
}

export function parseCampaigns(json: unknown): Campaign[] {
  return (json as CampaignsJson).campaigns
    .filter((c) => c.official)
    .map((c) => ({ id: c.id, name: c.name }))
}

export function parseCampaign(json: unknown): CampaignMap[] {
  return (json as CampaignJson).playlist.map((m) => ({ name: m.name, mapUid: m.mapUid }))
}

const GHOST_URL = /^\/api\/download\/ghost\/([0-9a-f-]{36})$/i

export function parseLeaderboard(json: unknown): LeaderboardRecord[] {
  const out: LeaderboardRecord[] = []
  for (const t of (json as LeaderboardJson).tops) {
    const ghostId = GHOST_URL.exec(t.url ?? '')?.[1]
    if (!ghostId) {
      continue
    }
    out.push({
      position: t.position,
      player: t.player.name,
      playerId: t.player.id,
      timeMs: t.time,
      timestamp: t.timestamp,
      ghostId,
    })
  }
  return out
}

export function filterRecords(records: LeaderboardRecord[], query: string): LeaderboardRecord[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) {
    return records
  }
  return records.filter((r) => r.player.toLowerCase().includes(q))
}

export function recordGhostUrl(ghostId: string): string {
  return tmioGhostUrl(ghostId)
}
