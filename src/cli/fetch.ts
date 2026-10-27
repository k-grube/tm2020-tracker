import type { TmxClient } from './tmx.ts'

export interface FetchFs {
  writeFile(path: string, data: Uint8Array | string): void
  readText(path: string): string | null
}

export interface FetchOptions {
  client: TmxClient
  out: string
  map?: number
  count: number
  uploads: boolean
  ghost?: string
  search?: string
}

export interface IndexEntry {
  recordId: string | null
  replayId: number | null
  position: number
  mapId: number
  recordTimeMs: number
}

export type FetchIndex = Record<string, IndexEntry>

function readIndex(fs: FetchFs, path: string): FetchIndex {
  const text = fs.readText(path)
  return text ? (JSON.parse(text) as FetchIndex) : {}
}

// returns the lines to print
export async function fetchCommand(
  opts: FetchOptions,
  fs: FetchFs,
  sleep: () => Promise<void>,
): Promise<string[]> {
  const { client } = opts
  if (opts.search !== undefined) {
    const maps = await client.searchMaps(opts.search, opts.count)
    return maps.map((m) => `${m.MapId}\t${m.MapUid}\t${m.Name}`)
  }

  const indexPath = `${opts.out}/index.json`
  const index = readIndex(fs, indexPath)
  const lines: string[] = []
  const save = (filename: string, bytes: Uint8Array, entry: IndexEntry): void => {
    fs.writeFile(`${opts.out}/${filename}`, bytes)
    index[filename] = entry
    lines.push(filename)
  }

  if (opts.ghost !== undefined) {
    const dl = await client.downloadOnlineRecord(opts.ghost)
    save(dl.filename, dl.bytes, {
      recordId: opts.ghost,
      replayId: null,
      position: 0,
      mapId: 0,
      recordTimeMs: 0,
    })
  } else if (opts.map !== undefined && opts.uploads) {
    const replays = await client.listReplays(opts.map, opts.count)
    for (const [i, r] of replays.entries()) {
      if (i > 0) {
        await sleep()
      }
      const dl = await client.downloadReplay(r.ReplayId)
      save(dl.filename, dl.bytes, {
        recordId: null,
        replayId: r.ReplayId,
        position: r.Position ?? i + 1,
        mapId: opts.map,
        recordTimeMs: r.ReplayTime,
      })
    }
  } else if (opts.map !== undefined) {
    const records = await client.listOnlineRecords(opts.map, opts.count)
    for (const [i, rec] of records.entries()) {
      if (i > 0) {
        await sleep()
      }
      const dl = await client.downloadOnlineRecord(rec.RecordId)
      save(dl.filename, dl.bytes, {
        recordId: rec.RecordId,
        replayId: null,
        position: rec.Position,
        mapId: opts.map,
        recordTimeMs: rec.RecordTime,
      })
    }
  } else {
    throw new Error('fetch needs --map, --ghost or --search')
  }

  fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n')
  return lines
}
