import type { TmxClient } from './tmx.ts'
import { ghostFilename, type TmioClient } from './tmio.ts'

export interface FetchFs {
  writeFile(path: string, data: Uint8Array | string): void
  readText(path: string): string | null
  exists(path: string): boolean
}

export interface FetchOptions {
  client: TmxClient
  tmio?: TmioClient
  out: string
  map?: number
  campaign?: number
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
  mapUid?: string
  recordTimeMs: number
  // nadeo leaderboards only: the account credited and the server's stamp for the record
  accountId?: string
  timestamp?: string
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
  // the index is rewritten after every file so an aborted pull keeps its positions
  const writeIndex = (): void => {
    fs.writeFile(indexPath, JSON.stringify(index, null, 2) + '\n')
  }
  const save = (filename: string, bytes: Uint8Array, entry: IndexEntry): void => {
    fs.writeFile(`${opts.out}/${filename}`, bytes)
    index[filename] = entry
    writeIndex()
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
  } else if (opts.campaign !== undefined) {
    if (!opts.tmio) {
      throw new Error('fetch --campaign needs a trackmania.io client')
    }
    const campaign = await opts.tmio.campaign(opts.campaign)
    lines.push(`${campaign.name}: ${campaign.maps.length} maps`)
    let first = true
    for (const m of campaign.maps) {
      const records = await opts.tmio.leaderboard(m.mapUid, opts.count)
      for (const rec of records) {
        const filename = ghostFilename(rec.player.name, rec.time, m.name)
        const entry: IndexEntry = {
          recordId: rec.url.split('/').pop() ?? null,
          replayId: null,
          position: rec.position,
          mapId: 0,
          mapUid: m.mapUid,
          recordTimeMs: rec.time,
          accountId: rec.player.id,
          timestamp: rec.timestamp,
        }
        // a file from an earlier pull keeps its bytes and gets its index entry
        if (fs.exists(`${opts.out}/${filename}`)) {
          index[filename] = entry
          writeIndex()
          lines.push(`${filename} kept`)
          continue
        }
        if (!first) {
          await sleep()
        }
        first = false
        const dl = await opts.tmio.downloadGhost(rec.url, rec.player.name, rec.time, m.name)
        save(filename, dl.bytes, entry)
      }
    }
  } else {
    throw new Error('fetch needs --map, --campaign, --ghost or --search')
  }

  writeIndex()
  return lines
}
