export const TMX_RECORD_BASE = 'https://trackmania.exchange/getonlinerecord/'

export function tmxRecordUrl(uuid: string): string {
  return TMX_RECORD_BASE + uuid
}

export function proxiedUrl(proxy: string, target: string): string {
  return `${proxy.replace(/\/+$/, '')}/?url=${encodeURIComponent(target)}`
}
