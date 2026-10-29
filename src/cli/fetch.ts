import { sanitizeFilename, type TmxClient } from './tmx.ts'
import type { NadeoClient } from '../nadeo/client.ts'
import { campaignMaps, mapLeaderboard } from '../nadeo/leaderboard.ts'

export interface FetchFs {
  writeFile(path: string, data: Uint8Array | string): void
  readText(path: string): string | null
  exists(path: string): boolean
}

export interface FetchOptions {
  client: TmxClient
  nadeo?: NadeoClient
  out: string
  map?: number
  // official campaign by id or name
  campaign?: string
  count: number
  uploads: boolean
  // nadeo map record id
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

// the official list goes back years, 50 covers it
const CAMPAIGN_LIST_LENGTH = 50

export function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function ghostFilename(player: string, timeMs: number, mapName: string): string {
  const time = String(timeMs).padStart(7, '0')
  return `${sanitizeFilename(player)}_(${time})_${kebab(mapName)}.Ghost.Gbx`
}

function readIndex(fs: FetchFs, path: string): FetchIndex {
  const text = fs.readText(path)
  return text ? (JSON.parse(text) as FetchIndex) : {}
}

function requireNadeo(opts: FetchOptions, flag: string): NadeoClient {
  if (!opts.nadeo) {
    throw new Error(`fetch ${flag} needs NADEO_LOGIN and NADEO_PASSWORD`)
  }
  return opts.nadeo
}

async function findCampaign(nadeo: NadeoClient, key: string) {
  const list = await nadeo.campaigns(CAMPAIGN_LIST_LENGTH)
  const found = list.find((c) => String(c.id) === key || c.name.toLowerCase() === key.toLowerCase())
  if (!found) {
    throw new Error(`campaign ${key} not found, official: ${list.map((c) => c.name).join(', ')}`)
  }
  return found
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
    const nadeo = requireNadeo(opts, '--ghost')
    const rec = await nadeo.mapRecord(opts.ghost)
    const [map] = await nadeo.mapInfoById([rec.mapId])
    const names = await nadeo.displayNames([rec.accountId])
    const filename = ghostFilename(
      names[rec.accountId] ?? rec.accountId,
      rec.timeMs,
      map?.name ?? rec.mapId,
    )
    save(filename, await nadeo.download(rec.url), {
      recordId: rec.mapRecordId,
      replayId: null,
      position: 0,
      mapId: 0,
      ...(map ? { mapUid: map.mapUid } : {}),
      recordTimeMs: rec.timeMs,
      accountId: rec.accountId,
      timestamp: rec.timestamp,
    })
    if (rec.removed) {
      lines[lines.length - 1] += ' removed'
    }
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
    const nadeo = requireNadeo(opts, '--campaign')
    const campaign = await findCampaign(nadeo, opts.campaign)
    const maps = await campaignMaps(nadeo, campaign)
    lines.push(`${campaign.name}: ${maps.length} maps`)
    let first = true
    for (const m of maps) {
      const records = await mapLeaderboard(nadeo, m.mapUid, m.mapId, opts.count)
      for (const rec of records) {
        const filename = ghostFilename(rec.player, rec.timeMs, m.name)
        const entry: IndexEntry = {
          recordId: rec.recordId,
          replayId: null,
          position: rec.position,
          mapId: 0,
          mapUid: m.mapUid,
          recordTimeMs: rec.timeMs,
          accountId: rec.accountId,
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
        save(filename, await nadeo.download(rec.url), entry)
      }
    }
  } else {
    throw new Error('fetch needs --map, --campaign, --ghost or --search')
  }

  writeIndex()
  return lines
}
