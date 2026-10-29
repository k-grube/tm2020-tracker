import { analyzeBytes } from '../core/pipeline.ts'
import { inflateWeb } from './inflate.ts'
import { fileViz } from './viz.ts'
import type { AnalyzeRequest, WorkerResponse } from './worker-protocol.ts'

const post = (msg: WorkerResponse): void => {
  self.postMessage(msg)
}

self.onmessage = async (ev: MessageEvent<AnalyzeRequest>) => {
  if (ev.data.type !== 'analyze') {
    return
  }
  try {
    const files = ev.data.files.map((f) => ({
      name: f.name,
      bytes: new Uint8Array(f.bytes),
      ...(f.leaderboard ? { leaderboard: f.leaderboard } : {}),
    }))
    const report = await analyzeBytes(files, ev.data.baseline, inflateWeb)
    post({ type: 'report', report, viz: files.map((f) => fileViz(f.bytes)) })
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
