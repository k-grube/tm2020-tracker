export const CORE_BASE = 'https://prod.trackmania.core.nadeo.online'
export const LIVE_BASE = 'https://live-services.trackmania.nadeo.live'
export const OAUTH_BASE = 'https://api.trackmania.com'
export const REPLAY_BASE = 'https://core.trackmania.nadeo.live/mapRecords/'

export type Audience = 'NadeoServices' | 'NadeoLiveServices'

export interface NadeoCredentials {
  login: string
  password: string
}

export interface OAuthCredentials {
  clientId: string
  clientSecret: string
}

export interface Campaign {
  id: number
  name: string
  mapUids: string[]
}

export interface MapInfo {
  mapUid: string
  mapId: string
  name: string
}

export interface LeaderboardTop {
  position: number
  accountId: string
  score: number
  timestamp: number
}

export interface MapRecord {
  accountId: string
  mapRecordId: string
  mapId: string
  timeMs: number
  timestamp: string
  url: string
  // taken off the leaderboard, the file still downloads
  removed: boolean
}

export interface NadeoClient {
  campaigns(length: number): Promise<Campaign[]>
  mapInfo(mapUids: string[]): Promise<MapInfo[]>
  mapInfoById(mapIds: string[]): Promise<MapInfo[]>
  leaderboard(mapUid: string, length: number): Promise<LeaderboardTop[]>
  mapRecords(mapId: string, accountIds: string[]): Promise<MapRecord[]>
  mapRecord(mapRecordId: string): Promise<MapRecord>
  displayNames(accountIds: string[]): Promise<Record<string, string>>
  download(url: string): Promise<Uint8Array>
}

export interface NadeoClientOptions {
  fetchFn: typeof fetch
  userAgent: string
  credentials: NadeoCredentials
  // display names come from the oauth api, without an app the account id stands in
  oauth?: OAuthCredentials | null
  // minimum spacing between any two requests, nadeo tolerates 2/s in bursts, less sustained
  gapMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

interface CampaignsJson {
  campaignList: { id: number; name: string; playlist: { position: number; mapUid: string }[] }[]
}

interface MapListJson {
  mapList: { uid: string; mapId: string; name: string }[]
}

interface LeaderboardJson {
  tops?: { top: { accountId: string; position: number; score: number; timestamp: number }[] }[]
}

interface MapRecordJson {
  accountId: string
  mapRecordId: string
  mapId: string
  recordScore: { time: number }
  timestamp: string
  url: string
  removed: boolean
}

interface CoreMapJson {
  mapId: string
  mapUid: string
  name: string
}

const toRecord = (r: MapRecordJson): MapRecord => ({
  accountId: r.accountId,
  mapRecordId: r.mapRecordId,
  mapId: r.mapId,
  timeMs: r.recordScore.time,
  timestamp: r.timestamp,
  url: r.url,
  removed: r.removed,
})

interface TokenSet {
  access: string
  refresh: string
  exp: number
}

const RETRY_WAITS_MS = [5000, 15000, 30000, 60000, 60000]
const TOKEN_MARGIN_S = 60
const ID_BATCH = 100
const NAME_BATCH = 50

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export function replayUrl(mapRecordId: string): string {
  return `${REPLAY_BASE}${mapRecordId.toLowerCase()}/replay`
}

// $fff colors, $o $i $s $w $n $m $t $g $z styles, $l[url] links, $$ is a literal dollar
export function stripFormat(name: string): string {
  return name.replace(/\$(\$|[0-9a-f]{3}|[lhp](?:\[[^\]]*\])?|.)/gi, (_, code: string) =>
    code === '$' ? '$' : '',
  )
}

function jwtExp(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) {
    return null
  }
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as {
      exp?: unknown
    }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export function createNadeoClient(opts: NadeoClientOptions): NadeoClient {
  const { fetchFn, userAgent, credentials } = opts
  const oauth = opts.oauth ?? null
  const gapMs = opts.gapMs ?? 1000
  const sleep = opts.sleep ?? defaultSleep
  const now = opts.now ?? Date.now
  const tokens = new Map<Audience, TokenSet>()
  let oauthToken: { access: string; exp: number } | null = null
  let last = -Infinity

  const gate = async (): Promise<void> => {
    const wait = last + gapMs - now()
    if (wait > 0) {
      await sleep(wait)
    }
    last = now()
  }

  // every request goes through the gate, a 429 waits retry-after or the growing schedule
  const send = async (url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      await gate()
      const res = await fetchFn(url, {
        ...init,
        headers: { 'User-Agent': userAgent, ...(init.headers as Record<string, string>) },
      })
      if (res.status !== 429 || attempt >= RETRY_WAITS_MS.length) {
        return res
      }
      const retryAfter = Number(res.headers.get('Retry-After'))
      await sleep(retryAfter > 0 ? retryAfter * 1000 : RETRY_WAITS_MS[attempt]!)
    }
  }

  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const res = await send(url, init)
    if (!res.ok) {
      throw new Error(`nadeo ${res.status} for ${url}`)
    }
    return res
  }

  const token = async (audience: Audience): Promise<string> => {
    const cached = tokens.get(audience)
    if (cached && cached.exp - TOKEN_MARGIN_S > now() / 1000) {
      return cached.access
    }
    let res: Response | null = null
    if (cached) {
      res = await send(`${CORE_BASE}/v2/authentication/token/refresh`, {
        method: 'POST',
        headers: { Authorization: `nadeo_v1 t=${cached.refresh}` },
      })
      if (!res.ok) {
        res = null
      }
    }
    if (!res) {
      res = await request(`${CORE_BASE}/v2/authentication/token/basic`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${credentials.login}:${credentials.password}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ audience }),
      })
    }
    const body = (await res.json()) as { accessToken: string; refreshToken: string }
    const set: TokenSet = {
      access: body.accessToken,
      refresh: body.refreshToken,
      exp: jwtExp(body.accessToken) ?? now() / 1000 + 3600,
    }
    tokens.set(audience, set)
    return set.access
  }

  const api = async <T>(audience: Audience, url: string): Promise<T> => {
    const res = await request(url, {
      headers: { Authorization: `nadeo_v1 t=${await token(audience)}` },
    })
    return (await res.json()) as T
  }

  const bearer = async (app: OAuthCredentials): Promise<string> => {
    if (oauthToken && oauthToken.exp - TOKEN_MARGIN_S > now() / 1000) {
      return oauthToken.access
    }
    const res = await request(`${OAUTH_BASE}/api/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: app.clientId,
        client_secret: app.clientSecret,
      }).toString(),
    })
    const body = (await res.json()) as { access_token: string; expires_in: number }
    oauthToken = { access: body.access_token, exp: now() / 1000 + body.expires_in }
    return oauthToken.access
  }

  return {
    async campaigns(length) {
      const body = await api<CampaignsJson>(
        'NadeoLiveServices',
        `${LIVE_BASE}/api/campaign/official?offset=0&length=${length}`,
      )
      return body.campaignList.map((c) => ({
        id: c.id,
        name: c.name,
        mapUids: [...c.playlist].sort((a, b) => a.position - b.position).map((p) => p.mapUid),
      }))
    },

    async mapInfo(mapUids) {
      const out: MapInfo[] = []
      for (const batch of chunks(mapUids, ID_BATCH)) {
        const list = batch.map(encodeURIComponent).join(',')
        const body = await api<MapListJson>(
          'NadeoLiveServices',
          `${LIVE_BASE}/api/token/map/get-multiple?mapUidList=${list}`,
        )
        out.push(
          ...body.mapList.map((m) => ({
            mapUid: m.uid,
            mapId: m.mapId,
            name: stripFormat(m.name),
          })),
        )
      }
      return out
    },

    async mapInfoById(mapIds) {
      const out: MapInfo[] = []
      for (const batch of chunks(mapIds, ID_BATCH)) {
        const body = await api<CoreMapJson[]>(
          'NadeoServices',
          `${CORE_BASE}/maps/by-id/?mapIdList=${batch.join(',')}`,
        )
        out.push(
          ...body.map((m) => ({ mapUid: m.mapUid, mapId: m.mapId, name: stripFormat(m.name) })),
        )
      }
      return out
    },

    async leaderboard(mapUid, length) {
      const body = await api<LeaderboardJson>(
        'NadeoLiveServices',
        `${LIVE_BASE}/api/token/leaderboard/group/Personal_Best/map/${encodeURIComponent(mapUid)}/top?onlyWorld=true&length=${length}&offset=0`,
      )
      return (body.tops?.[0]?.top ?? []).map((t) => ({
        position: t.position,
        accountId: t.accountId,
        score: t.score,
        timestamp: t.timestamp,
      }))
    },

    async mapRecords(mapId, accountIds) {
      const out: MapRecord[] = []
      for (const batch of chunks(accountIds, ID_BATCH)) {
        const body = await api<MapRecordJson[]>(
          'NadeoServices',
          `${CORE_BASE}/v2/mapRecords/by-account/?accountIdList=${batch.join(',')}&mapId=${mapId}`,
        )
        out.push(...body.map(toRecord))
      }
      return out
    },

    async mapRecord(mapRecordId) {
      const body = await api<MapRecordJson>(
        'NadeoServices',
        `${CORE_BASE}/mapRecords/${mapRecordId.toLowerCase()}`,
      )
      return toRecord(body)
    },

    async displayNames(accountIds) {
      if (!oauth) {
        return {}
      }
      const names: Record<string, string> = {}
      for (const batch of chunks(accountIds, NAME_BATCH)) {
        const query = new URLSearchParams()
        for (const id of batch) {
          query.append('accountId[]', id)
        }
        const res = await request(`${OAUTH_BASE}/api/display-names?${query}`, {
          headers: { Authorization: `Bearer ${await bearer(oauth)}` },
        })
        Object.assign(names, (await res.json()) as Record<string, string>)
      }
      return names
    },

    async download(url) {
      const res = await request(url)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}
