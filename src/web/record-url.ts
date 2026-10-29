import { REPLAY_BASE, replayUrl } from '../nadeo/client.ts'

export const TMX_RECORD_BASE = 'https://trackmania.exchange/getonlinerecord/'
export const TMX_REPLAY_BASE = 'https://trackmania.exchange/recordgbx/'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const REPLAY_HOST = new URL(REPLAY_BASE).hostname

export function tmxRecordUrl(uuid: string): string {
  return TMX_RECORD_BASE + uuid.toLowerCase()
}

export function tmxReplayUrl(id: string): string {
  return TMX_REPLAY_BASE + id
}

// download links for a pasted id or url, rebuilt from the id so only tmx and the nadeo record
// store are ever linked. a bare uuid is a tmx record or a nadeo map record, a bare number is a
// tmx upload
export function recordUrls(input: string): string[] {
  const text = input.trim()
  if (UUID.test(text)) {
    return [tmxRecordUrl(text), replayUrl(text)]
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
  if (host === REPLAY_HOST && parts.length === 3) {
    const [kind, id, tail] = parts as [string, string, string]
    if (kind === 'mapRecords' && UUID.test(id) && tail === 'replay') {
      return [replayUrl(id)]
    }
  }
  return []
}
