export const TMX_RECORD_BASE = 'https://trackmania.exchange/getonlinerecord/'
export const TMX_REPLAY_BASE = 'https://trackmania.exchange/recordgbx/'
export const TMIO_GHOST_BASE = 'https://trackmania.io/api/download/ghost/'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function tmxRecordUrl(uuid: string): string {
  return TMX_RECORD_BASE + uuid.toLowerCase()
}

export function tmxReplayUrl(id: string): string {
  return TMX_REPLAY_BASE + id
}

export function tmioGhostUrl(uuid: string): string {
  return TMIO_GHOST_BASE + uuid.toLowerCase()
}

export function proxiedUrl(proxy: string, target: string): string {
  return `${proxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(target)}`
}

// download urls to try in order for a pasted id or url, rebuilt from the id so only tmx and
// trackmania.io are ever fetched. a bare uuid exists on either site, a bare number is a tmx upload
export function recordUrls(input: string): string[] {
  const text = input.trim()
  if (UUID.test(text)) {
    return [tmxRecordUrl(text), tmioGhostUrl(text)]
  }
  if (/^\d+$/.test(text)) {
    return [tmxReplayUrl(text)]
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return []
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const parts = url.pathname.split('/').filter((p) => p.length > 0)
  if (host === 'trackmania.exchange' && parts.length === 2) {
    const [kind, id] = parts as [string, string]
    if (kind === 'getonlinerecord' && UUID.test(id)) {
      return [tmxRecordUrl(id)]
    }
    if (kind === 'recordgbx' && /^\d+$/.test(id)) {
      return [tmxReplayUrl(id)]
    }
  }
  if (host === 'trackmania.io' && parts.length === 4) {
    const [a, b, c, id] = parts as [string, string, string, string]
    if (a === 'api' && b === 'download' && c === 'ghost' && UUID.test(id)) {
      return [tmioGhostUrl(id)]
    }
  }
  return []
}
