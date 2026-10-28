import { useEffect, useRef, useState } from 'react'
import type { Baseline, Report } from '../core/signals/types.ts'
import type { FileViz } from './viz.ts'
import type { AnalyzeRequest, WorkerResponse } from './worker-protocol.ts'
import { DropZone } from './components/DropZone.tsx'
import { FileReportView } from './components/FileReportView.tsx'
import { GroupsView } from './components/GroupsView.tsx'

interface Result {
  report: Report
  viz: (FileViz | null)[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const [baseline, setBaseline] = useState<Baseline | null | undefined>(undefined)
  const [result, setResult] = useState<Result | null>(null)
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
      } else {
        setError(ev.data.message)
      }
    }
    worker.current = w
    loadBaseline().then(setBaseline)
    return () => w.terminate()
  }, [])

  const analyze = async (files: File[]) => {
    if (!worker.current || files.length === 0) {
      return
    }
    setBusy(true)
    const payload = await Promise.all(
      files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })),
    )
    const msg: AnalyzeRequest = { type: 'analyze', files: payload, baseline: baseline ?? null }
    worker.current.postMessage(
      msg,
      payload.map((p) => p.bytes),
    )
  }

  const trimmed = uuid.trim()
  return (
    <main>
      <h1>tm2020 replay analyzer</h1>
      <DropZone onFiles={analyze} busy={busy} />
      <p className="tmx">
        <label>
          TMX online record uuid{' '}
          <input
            value={uuid}
            onChange={(e) => setUuid(e.target.value)}
            placeholder="e9beeecb-c76a-44dc-93db-e733acbd3998"
            spellCheck={false}
          />
        </label>{' '}
        {UUID_RE.test(trimmed) && (
          <a
            href={`https://trackmania.exchange/getonlinerecord/${trimmed}`}
            target="_blank"
            rel="noreferrer"
          >
            download from TMX
          </a>
        )}
      </p>
      <p className="meta">
        {baseline === undefined
          ? 'baseline loading'
          : baseline
            ? `baseline ${baseline.files} records, ranks ${baseline.ranks[0]} to ${baseline.ranks[1]}`
            : 'no baseline'}
      </p>
      {error && <p className="error">{error}</p>}
      {result && (
        <>
          {result.report.files.map((f, i) => (
            <FileReportView key={`${i}-${f.name}`} report={f} viz={result.viz[i] ?? null} />
          ))}
          <GroupsView groups={result.report.groups} />
        </>
      )}
    </main>
  )
}
