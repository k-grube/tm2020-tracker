import { useEffect, useRef, useState } from 'react'
import type { Baseline, Report } from '../core/signals/types.ts'
import type { FileViz } from './viz.ts'
import type { AnalyzeRequest, WorkerResponse } from './worker-protocol.ts'
import { DropZone } from './components/DropZone.tsx'
import { FileReportView } from './components/FileReportView.tsx'
import { FileTabs } from './components/FileTabs.tsx'
import { GroupsView } from './components/GroupsView.tsx'
import { CampaignBrowser } from './components/CampaignBrowser.tsx'
import { Glossary } from './components/Glossary.tsx'
import { addFiles, type StoredFile } from './files.ts'
import { isGbx, proxiedUrl, recordUrls } from './proxy.ts'
import { recordGhostUrl } from './tmio.ts'
import { clearFiles, deleteFile, listFiles, putFile } from './store.ts'

interface Result {
  report: Report
  viz: (FileViz | null)[]
}

// cors proxy in front of the download hosts, worker/proxy.js, unset means a plain download link
const PROXY = (import.meta.env.VITE_PROXY_URL as string | undefined) || undefined

const INPUT =
  'w-[24rem] max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
const BUTTON =
  'rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const LINK = 'text-blue-600 hover:underline dark:text-blue-400'
const TAB = 'rounded-md px-3 py-1 text-sm'
const TAB_ON = `${TAB} bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900`
const TAB_OFF = `${TAB} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800`

// a missing file, a fetch error, or json without signals all mean no baseline
async function loadBaseline(): Promise<Baseline | null> {
  try {
    const res = await fetch(import.meta.env.BASE_URL + 'baseline.json')
    if (!res.ok) {
      return null
    }
    const json: unknown = await res.json()
    return json !== null && typeof json === 'object' && 'signals' in json
      ? (json as Baseline)
      : null
  } catch {
    return null
  }
}

export function App() {
  const worker = useRef<Worker | null>(null)
  const pendingSelect = useRef<number | null>(null)
  const [baseline, setBaseline] = useState<Baseline | null | undefined>(undefined)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uuid, setUuid] = useState('')
  const [mode, setMode] = useState<'files' | 'campaign'>('files')

  useEffect(() => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      setBusy(false)
      if (ev.data.type === 'report') {
        setResult({ report: ev.data.report, viz: ev.data.viz })
        setError(null)
        if (pendingSelect.current !== null) {
          setSelected(pendingSelect.current)
          pendingSelect.current = null
        }
      } else {
        setError(ev.data.message)
      }
    }
    worker.current = w
    loadBaseline().then(setBaseline)
    return () => w.terminate()
  }, [])

  // every loaded file goes to the worker together so the cross-file signals cover the whole set
  const analyzeAll = (next: StoredFile[], select: number | null) => {
    setFiles(next)
    if (next.length === 0) {
      setResult(null)
      setSelected(0)
      return
    }
    if (!worker.current) {
      return
    }
    setBusy(true)
    pendingSelect.current = select
    const payload = next.map((f) => ({ name: f.name, bytes: f.bytes.slice().buffer }))
    const msg: AnalyzeRequest = { type: 'analyze', files: payload, baseline: baseline ?? null }
    worker.current.postMessage(
      msg,
      payload.map((p) => p.bytes),
    )
  }

  // files kept from the last visit come back on load
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) {
      return
    }
    restored.current = true
    listFiles().then((kept) => {
      if (kept.length > 0) {
        analyzeAll(kept, kept.length - 1)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addAndAnalyze = (incoming: StoredFile[]) => {
    const { files: next, added } = addFiles(files, incoming)
    if (added.length === 0) {
      const i = files.findIndex((f) => f.name === incoming[0]?.name)
      if (i >= 0) {
        setSelected(i)
      }
      return
    }
    for (const i of added) {
      void putFile(next[i]!)
    }
    analyzeAll(next, added[added.length - 1]!)
  }

  const analyze = async (picked: File[]) => {
    if (picked.length === 0) {
      return
    }
    const incoming = await Promise.all(
      picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    )
    addAndAnalyze(incoming)
  }

  // a bare uuid may live on either site, the first url that answers with a gbx file wins
  const fetchRecord = async (urls: string[]) => {
    if (!PROXY) {
      return
    }
    setBusy(true)
    try {
      let last = ''
      for (const url of urls) {
        const res = await fetch(proxiedUrl(PROXY, url))
        if (!res.ok) {
          last = `proxy ${res.status}: ${await res.text()}`
          continue
        }
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (!isGbx(bytes)) {
          last = `${url}: not a Gbx file`
          continue
        }
        const disposition = res.headers.get('Content-Disposition') ?? ''
        const name =
          /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${url.split('/').pop()}.Ghost.Gbx`
        setBusy(false)
        addAndAnalyze([{ name, bytes }])
        return
      }
      throw new Error(last)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const remove = (i: number) => {
    const gone = files[i]
    if (gone) {
      void deleteFile(gone.name, gone.bytes.length)
    }
    const next = files.filter((_, k) => k !== i)
    analyzeAll(next, Math.min(selected > i ? selected - 1 : selected, Math.max(next.length - 1, 0)))
  }

  const urls = recordUrls(uuid)
  const reports = result?.report.files ?? []
  const current = reports[selected]
  const tabs = reports.map((r) => ({
    name: r.name,
    nickname: r.nickname,
    raceTimeMs: r.raceTimeMs,
    needsHumanReview: r.summary.needsHumanReview,
  }))

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
      <h1 className="text-xl font-semibold tracking-tight">tm2020 replay analyzer</h1>
      {PROXY && (
        <div className="mt-4 flex gap-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'files'}
            className={mode === 'files' ? TAB_ON : TAB_OFF}
            onClick={() => setMode('files')}
          >
            files
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'campaign'}
            className={mode === 'campaign' ? TAB_ON : TAB_OFF}
            onClick={() => setMode('campaign')}
          >
            campaign leaderboards
          </button>
        </div>
      )}
      {mode === 'campaign' && PROXY ? (
        <CampaignBrowser
          proxy={PROXY}
          busy={busy}
          onAnalyze={(r) => fetchRecord([recordGhostUrl(r.ghostId)])}
        />
      ) : (
        <>
          <DropZone onFiles={analyze} busy={busy} />
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex flex-wrap items-center gap-2">
              <span className="text-zinc-600 dark:text-zinc-400">record uuid or url</span>
              <input
                className={INPUT}
                value={uuid}
                onChange={(e) => setUuid(e.target.value)}
                placeholder="e9beeecb-c76a-44dc-93db-e733acbd3998"
                spellCheck={false}
              />
            </label>
            {urls.length > 0 &&
              (PROXY ? (
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => fetchRecord(urls)}
                  disabled={busy}
                >
                  fetch
                </button>
              ) : (
                <a className={LINK} href={urls[0]} target="_blank" rel="noreferrer">
                  download
                </a>
              ))}
          </div>
        </>
      )}
      <p className="mt-2 text-sm text-zinc-500">
        {baseline === undefined
          ? 'baseline loading'
          : baseline
            ? `baseline ${baseline.files} records, ranks ${baseline.ranks[0]} to ${baseline.ranks[1]}`
            : 'no baseline'}
      </p>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <FileTabs
        entries={tabs}
        selected={selected}
        onSelect={setSelected}
        onRemove={remove}
        onClear={() => {
          void clearFiles()
          analyzeAll([], null)
        }}
      />
      {result && current && (
        <>
          <FileReportView
            key={`${selected}-${current.name}`}
            report={current}
            viz={result.viz[selected] ?? null}
          />
          <GroupsView groups={result.report.groups} files={result.report.files} />
        </>
      )}
      <Glossary />
    </main>
  )
}
