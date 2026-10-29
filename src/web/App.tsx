import { useEffect, useRef, useState } from 'react'
import type { Baseline, Report } from '../core/signals/types.ts'
import type { FileViz } from './viz.ts'
import type { AnalyzeRequest, WorkerResponse } from './worker-protocol.ts'
import { DropZone } from './components/DropZone.tsx'
import { FileReportView } from './components/FileReportView.tsx'
import { FileTabs, type TabSort } from './components/FileTabs.tsx'
import { GroupsView } from './components/GroupsView.tsx'
import { Glossary } from './components/Glossary.tsx'
import { addFiles, type StoredFile } from './files.ts'
import { recordUrls } from './record-url.ts'
import { clearFiles, deleteFile, listFiles, putFile } from './store.ts'

interface Result {
  report: Report
  viz: (FileViz | null)[]
}

const INPUT =
  'w-[24rem] max-w-full rounded-md border border-zinc-300 bg-white px-2 py-1 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100'
const LINK = 'text-blue-600 hover:underline dark:text-blue-400'

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

const linkLabel = (url: string): string =>
  new URL(url).hostname.includes('nadeo') ? 'nadeo' : 'tmx'

export function App() {
  const worker = useRef<Worker | null>(null)
  const pendingSelect = useRef<number | null>(null)
  const baselineRef = useRef<Baseline | null>(null)
  const filesRef = useRef<StoredFile[]>([])
  const [baseline, setBaseline] = useState<Baseline | null | undefined>(undefined)
  const [files, setFiles] = useState<StoredFile[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [selected, setSelected] = useState(0)
  const [sort, setSort] = useState<TabSort>('name')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [uuid, setUuid] = useState('')

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
    return () => w.terminate()
  }, [])

  // every loaded file goes to the worker together so the cross-file signals cover the whole set
  const analyzeAll = (next: StoredFile[], select: number | null) => {
    setFiles(next)
    filesRef.current = next
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
    const msg: AnalyzeRequest = { type: 'analyze', files: payload, baseline: baselineRef.current }
    worker.current.postMessage(
      msg,
      payload.map((p) => p.bytes),
    )
  }

  // the baseline and the files kept from the last visit load together, anything dropped in the
  // meantime is analyzed again once the baseline is in
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) {
      return
    }
    restored.current = true
    Promise.all([loadBaseline(), listFiles()]).then(([b, kept]) => {
      baselineRef.current = b
      setBaseline(b)
      const current = filesRef.current.length > 0 ? filesRef.current : kept
      if (current.length > 0) {
        analyzeAll(current, current.length - 1)
      }
    })
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
    status: r.summary.needsHumanReview
      ? ('review' as const)
      : r.login === '' && r.raceTimeMs === null
        ? ('error' as const)
        : r.signals.some((s) => s.fired)
          ? ('warn' as const)
          : ('ok' as const),
  }))

  return (
    <main className="mx-auto max-w-5xl px-4 pt-6 pb-16">
      <h1 className="text-xl font-semibold tracking-tight">tm2020 replay analyzer</h1>
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
        {urls.map((url) => (
          <a key={url} className={LINK} href={url} target="_blank" rel="noreferrer">
            download from {linkLabel(url)}
          </a>
        ))}
      </div>
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
        sort={sort}
        onSort={setSort}
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
