import { useState } from 'react'
import type { StoredFile } from '../files.ts'
import { isGbx, proxiedUrl } from '../proxy.ts'
import { parseRecords, recordsUrl, tmxMapId, tmxRecordDownloadUrl, TOP_N } from '../tmx.ts'

const INPUT =
  'w-[28rem] max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
const BUTTON =
  'rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const DELAY_MS = 200

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// pulls the top records of one tmx map through the proxy and hands the ghost files up as a batch
export function MapRecords({
  proxy,
  busy,
  onFiles,
}: {
  proxy: string
  busy: boolean
  onFiles: (files: StoredFile[]) => void
}) {
  const [link, setLink] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapId = tmxMapId(link)

  const run = async (id: number) => {
    setError(null)
    setProgress('listing records')
    try {
      const listed = await fetch(proxiedUrl(proxy, recordsUrl(id, TOP_N)))
      if (!listed.ok) {
        throw new Error(`proxy ${listed.status}: ${await listed.text()}`)
      }
      const records = parseRecords(await listed.json())
      if (records.length === 0) {
        throw new Error('no online records for this map')
      }
      const files: StoredFile[] = []
      for (const [i, r] of records.entries()) {
        setProgress(`${i + 1} / ${records.length}`)
        if (i > 0) {
          await wait(DELAY_MS)
        }
        const res = await fetch(proxiedUrl(proxy, tmxRecordDownloadUrl(r.recordId)))
        if (!res.ok) {
          throw new Error(`record ${r.position}: proxy ${res.status}`)
        }
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (!isGbx(bytes)) {
          throw new Error(`record ${r.position}: not a Gbx file`)
        }
        const disposition = res.headers.get('Content-Disposition') ?? ''
        const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${r.recordId}.Ghost.Gbx`
        files.push({ name, bytes })
      }
      setProgress(null)
      onFiles(files)
    } catch (e) {
      setProgress(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-600 dark:text-zinc-400">TMX map link or id</span>
          <input
            className={INPUT}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://trackmania.exchange/maps/151406"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={mapId === null || busy || progress !== null}
          onClick={() => mapId !== null && run(mapId)}
        >
          analyze top {TOP_N}
        </button>
        {progress && <span className="text-zinc-500">{progress}</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
