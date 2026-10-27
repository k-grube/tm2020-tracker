export const TMX_BASE = 'https://trackmania.exchange'

export interface MapListing {
  MapId: number
  Name: string
  MapUid: string
}

export interface OnlineRecord {
  Position: number
  RecordTime: number
  DisplayName: string
  AccountId: string
  RecordId: string
  RecordAt: string
}

export interface ReplayListing {
  ReplayId: number
  ReplayTime: number
  ReplayAt?: string
  Position?: number
  IsBest?: boolean
  HasFile?: boolean
  User?: { Name: string }
}

export interface Download {
  filename: string
  bytes: Uint8Array
}

export interface TmxClient {
  searchMaps(name: string, count?: number): Promise<MapListing[]>
  listOnlineRecords(mapId: number, count?: number): Promise<OnlineRecord[]>
  listReplays(mapId: number, count?: number): Promise<ReplayListing[]>
  downloadOnlineRecord(recordId: string): Promise<Download>
  downloadReplay(replayId: number): Promise<Download>
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._()-]/g, '')
}

function filenameFrom(headers: Headers, fallback: string): string {
  const cd = headers.get('content-disposition') ?? ''
  const m = /filename="([^"]+)"|filename=([^;]+)/i.exec(cd)
  const raw = m?.[1] ?? m?.[2]
  const name = raw ? sanitizeFilename(raw.trim()) : ''
  return name.length > 0 ? name : fallback
}

const PAGE = 100

export function createTmxClient(fetchFn: typeof fetch, userAgent: string): TmxClient {
  const headers = { 'User-Agent': userAgent }

  const get = async (path: string, params: Record<string, string>): Promise<Response> => {
    const url = new URL(path, TMX_BASE)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }
    const res = await fetchFn(url.toString(), { headers })
    if (!res.ok) {
      throw new Error(`tmx ${res.status} for ${url}`)
    }
    return res
  }

  const download = async (path: string, fallback: string): Promise<Download> => {
    const res = await get(path, {})
    return {
      filename: filenameFrom(res.headers, fallback),
      bytes: new Uint8Array(await res.arrayBuffer()),
    }
  }

  return {
    async searchMaps(name, count = 10) {
      const res = await get('/api/maps', {
        name,
        fields: 'MapId,Name,MapUid',
        count: String(count),
      })
      const body = (await res.json()) as { Results: MapListing[] }
      return body.Results
    },

    async listOnlineRecords(mapId, count = 50) {
      const res = await get('/api/maps/getonlinerecords', {
        mapId: String(mapId),
        count: String(count),
      })
      const body = (await res.json()) as { Results: OnlineRecord[] }
      return body.Results
    },

    async listReplays(mapId, count = 50) {
      const out: ReplayListing[] = []
      let after: number | null = null
      for (;;) {
        const params: Record<string, string> = {
          mapId: String(mapId),
          fields: 'ReplayId,User.Name,ReplayTime,ReplayAt,Position,IsBest,HasFile',
          count: String(Math.min(PAGE, count - out.length)),
        }
        if (after !== null) {
          params.after = String(after)
        }
        const res = await get('/api/replays', params)
        const body = (await res.json()) as { More: boolean; Results: ReplayListing[] }
        out.push(...body.Results)
        const last = body.Results.at(-1)
        if (!body.More || out.length >= count || !last) {
          return out.slice(0, count)
        }
        after = last.ReplayId
      }
    },

    downloadOnlineRecord(recordId) {
      return download(`/getonlinerecord/${recordId}`, `${recordId}.Ghost.Gbx`)
    },

    downloadReplay(replayId) {
      return download(`/recordgbx/${replayId}`, `tmx-${replayId}.Replay.Gbx`)
    },
  }
}
