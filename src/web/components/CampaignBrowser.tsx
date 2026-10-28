import { useEffect, useState } from 'react'
import { fmtMs } from '../format.ts'
import { proxiedUrl } from '../proxy.ts'
import {
  campaignUrl,
  campaignsUrl,
  filterRecords,
  leaderboardUrl,
  parseCampaign,
  parseCampaigns,
  parseLeaderboard,
  TOP_N,
  type Campaign,
  type CampaignMap,
  type LeaderboardRecord,
} from '../tmio.ts'

const SELECT =
  'rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
const INPUT = `${SELECT} w-56 placeholder:text-zinc-400`
const BUTTON =
  'rounded-md bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const CELL = 'border-b border-zinc-200 py-1 pr-4 dark:border-zinc-800'

const cache = new Map<string, Promise<unknown>>()

function getJson(proxy: string, url: string): Promise<unknown> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(proxiedUrl(proxy, url)).then(async (res) => {
      if (!res.ok) {
        throw new Error(`proxy ${res.status}: ${await res.text()}`)
      }
      return res.json()
    })
    p.catch(() => cache.delete(url))
    cache.set(url, p)
  }
  return p
}

export function RecordTable({
  records,
  busy,
  onAnalyze,
}: {
  records: LeaderboardRecord[]
  busy: boolean
  onAnalyze: (record: LeaderboardRecord) => void
}) {
  return (
    <table className="mt-3 w-full border-collapse text-sm tabular-nums">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className={`${CELL} font-medium`}>#</th>
          <th className={`${CELL} font-medium`}>player</th>
          <th className={`${CELL} font-medium`}>time</th>
          <th className={`${CELL} font-medium`}>set</th>
          <th className={CELL} />
        </tr>
      </thead>
      <tbody>
        {records.map((r) => (
          <tr key={r.ghostId}>
            <td className={CELL}>{r.position}</td>
            <td className={`${CELL} break-all`}>{r.player}</td>
            <td className={CELL}>{fmtMs(r.timeMs)}</td>
            <td className={`${CELL} text-zinc-500`}>{r.timestamp.slice(0, 10)}</td>
            <td className={`${CELL} text-right`}>
              <button type="button" className={BUTTON} disabled={busy} onClick={() => onAnalyze(r)}>
                analyze
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function CampaignBrowser({
  proxy,
  busy,
  onAnalyze,
}: {
  proxy: string
  busy: boolean
  onAnalyze: (record: LeaderboardRecord) => void
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState<number | null>(null)
  const [maps, setMaps] = useState<CampaignMap[]>([])
  const [mapUid, setMapUid] = useState<string | null>(null)
  const [records, setRecords] = useState<LeaderboardRecord[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))

  useEffect(() => {
    getJson(proxy, campaignsUrl())
      .then((json) => {
        const list = parseCampaigns(json)
        setCampaigns(list)
        setCampaignId((id) => id ?? list[0]?.id ?? null)
      })
      .catch(fail)
  }, [proxy])

  useEffect(() => {
    if (campaignId === null) {
      return
    }
    getJson(proxy, campaignUrl(campaignId))
      .then((json) => {
        const list = parseCampaign(json)
        setMaps(list)
        setMapUid(list[0]?.mapUid ?? null)
      })
      .catch(fail)
  }, [proxy, campaignId])

  useEffect(() => {
    if (mapUid === null) {
      return
    }
    getJson(proxy, leaderboardUrl(mapUid, TOP_N))
      .then((json) => setRecords(parseLeaderboard(json)))
      .catch(fail)
  }, [proxy, mapUid])

  const shown = records ? filterRecords(records, query) : []

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select
          className={SELECT}
          value={campaignId ?? ''}
          onChange={(e) => {
            setCampaignId(Number(e.target.value))
            setMaps([])
            setMapUid(null)
            setRecords(null)
          }}
          disabled={campaigns.length === 0}
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className={SELECT}
          value={mapUid ?? ''}
          onChange={(e) => {
            setMapUid(e.target.value)
            setRecords(null)
          }}
          disabled={maps.length === 0}
        >
          {maps.map((m) => (
            <option key={m.mapUid} value={m.mapUid}>
              {m.name}
            </option>
          ))}
        </select>
        <input
          className={INPUT}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="player"
          spellCheck={false}
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {records === null && !error && mapUid !== null && (
        <p className="mt-2 text-sm text-zinc-500">loading</p>
      )}
      {records && shown.length === 0 && <p className="mt-2 text-sm text-zinc-500">no records</p>}
      {shown.length > 0 && <RecordTable records={shown} busy={busy} onAnalyze={onAnalyze} />}
    </div>
  )
}
