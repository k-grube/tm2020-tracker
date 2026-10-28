export const TMX_BASE = 'https://trackmania.exchange'
export const TOP_N = 25

export interface TmxRecord {
  position: number
  player: string
  timeMs: number
  timestamp: string
  recordId: string
}

// map id from a tmx map link (maps, mapshow, s/tr) or a bare number, null for anything else
export function tmxMapId(input: string): number | null {
  const text = input.trim()
  if (/^\d+$/.test(text)) {
    return Number(text)
  }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'trackmania.exchange') {
    return null
  }
  const m = /^\/(?:maps|mapshow|s\/tr)\/(\d+)(?:\/|$)/.exec(url.pathname)
  return m ? Number(m[1]) : null
}

export function recordsUrl(mapId: number, count: number): string {
  return `${TMX_BASE}/api/maps/getonlinerecords?mapId=${mapId}&count=${count}`
}

export function tmxRecordDownloadUrl(recordId: string): string {
  return `${TMX_BASE}/getonlinerecord/${recordId}`
}

interface RecordsJson {
  Results: {
    Position: number
    RecordTime: number
    DisplayName: string
    RecordId: string
    RecordAt: string
  }[]
}

// tmx ignores count on this endpoint and always sends 50
export function parseRecords(json: unknown, limit = TOP_N): TmxRecord[] {
  return (json as RecordsJson).Results.slice(0, limit).map((r) => ({
    position: r.Position,
    player: r.DisplayName,
    timeMs: r.RecordTime,
    timestamp: r.RecordAt,
    recordId: r.RecordId,
  }))
}
