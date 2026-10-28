import { sanitizeFilename, type Download } from './tmx.ts'

export const TMIO_BASE = 'https://trackmania.io'

export interface TmioMap {
  name: string
  mapUid: string
}

export interface TmioRecord {
  position: number
  time: number
  timestamp: string
  url: string
  player: { name: string; id: string }
}

export interface TmioClient {
  campaign(id: number): Promise<{ name: string; maps: TmioMap[] }>
  leaderboard(mapUid: string, count: number): Promise<TmioRecord[]>
  downloadGhost(url: string, player: string, timeMs: number, mapName: string): Promise<Download>
}

export function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface CampaignJson {
  name: string
  playlist: { name: string; mapUid: string }[]
}

interface LeaderboardJson {
  tops: {
    position: number
    time: number
    timestamp: string
    url: string
    player: { name: string; id: string }
  }[]
}

// 625 ghosts in one campaign pull, the site answers bursts with 429 for a minute or more
const RETRY_WAITS_MS = [5000, 15000, 30000, 60000, 60000]

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function ghostFilename(player: string, timeMs: number, mapName: string): string {
  const time = String(timeMs).padStart(7, '0')
  return `${sanitizeFilename(player)}_(${time})_${kebab(mapName)}.Ghost.Gbx`
}

// nadeo leaderboards through trackmania.io, ghost files come back as .Ghost.Gbx
// a 429 is retried with growing waits, the site rate limits bursts of ghost downloads
export function createTmioClient(
  fetchFn: typeof fetch,
  userAgent: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): TmioClient {
  const headers = { 'User-Agent': userAgent }

  const get = async (path: string): Promise<Response> => {
    const url = new URL(path, TMIO_BASE)
    for (let attempt = 0; ; attempt++) {
      const res = await fetchFn(url.toString(), { headers })
      if (res.ok) {
        return res
      }
      if (res.status === 429 && attempt < RETRY_WAITS_MS.length) {
        const retryAfter = Number(res.headers.get('Retry-After'))
        await sleep(retryAfter > 0 ? retryAfter * 1000 : RETRY_WAITS_MS[attempt]!)
        continue
      }
      throw new Error(`trackmania.io ${res.status} for ${url}`)
    }
  }

  return {
    async campaign(id) {
      const body = (await (await get(`/api/campaign/seasonal/${id}`)).json()) as CampaignJson
      return {
        name: body.name,
        maps: body.playlist.map((m) => ({ name: m.name, mapUid: m.mapUid })),
      }
    },

    async leaderboard(mapUid, count) {
      const path = `/api/leaderboard/map/${encodeURIComponent(mapUid)}?offset=0&length=${count}`
      const body = (await (await get(path)).json()) as LeaderboardJson
      return body.tops.map((t) => ({
        position: t.position,
        time: t.time,
        timestamp: t.timestamp,
        url: t.url,
        player: { name: t.player.name, id: t.player.id },
      }))
    },

    async downloadGhost(url, player, timeMs, mapName) {
      const res = await get(url)
      return {
        filename: ghostFilename(player, timeMs, mapName),
        bytes: new Uint8Array(await res.arrayBuffer()),
      }
    },
  }
}
