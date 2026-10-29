import { describe, expect, test } from 'vitest'
import { fetchCommand, ghostFilename, kebab, type FetchFs } from './fetch.ts'
import type { TmxClient } from './tmx.ts'
import type { NadeoClient } from '../nadeo/client.ts'

describe('kebab', () => {
  test('lowercases and joins words with single dashes', () => {
    expect(kebab('Fall 2026 - 01')).toBe('fall-2026-01')
    expect(kebab('  Vault of the Sun!! ')).toBe('vault-of-the-sun')
  })
})

describe('ghostFilename', () => {
  test('player, zero padded time and kebab map name', () => {
    expect(ghostFilename('Kar jeN/', 19988, 'Fall 2026 - 01')).toBe(
      'KarjeN_(0019988)_fall-2026-01.Ghost.Gbx',
    )
  })
})

describe('fetchCommand --campaign', () => {
  function memFs() {
    const files = new Map<string, Uint8Array | string>()
    const fs: FetchFs = {
      writeFile: (path, data) => {
        files.set(path, data)
      },
      readText: (path) => {
        const v = files.get(path)
        return typeof v === 'string' ? v : null
      },
      exists: (path) => files.has(path),
    }
    return { fs, files }
  }

  const tmx: TmxClient = {
    searchMaps: async () => [],
    listReplays: async () => [],
    listOnlineRecords: async () => [],
    downloadOnlineRecord: async () => ({ filename: 'x', bytes: new Uint8Array() }),
    downloadReplay: async () => ({ filename: 'x', bytes: new Uint8Array() }),
  }

  const nadeo: NadeoClient = {
    campaigns: async () => [
      { id: 157584, name: 'Fall 2026', mapUids: ['u1', 'u2'] },
      { id: 150000, name: 'Summer 2026', mapUids: ['u9'] },
    ],
    // served out of playlist order
    mapInfo: async (uids) =>
      [...uids].reverse().map((uid) => ({
        mapUid: uid,
        mapId: `id-${uid}`,
        name: `Fall 2026 - 0${uid.slice(1)}`,
      })),
    leaderboard: async (mapUid, length) =>
      Array.from({ length }, (_, i) => ({
        position: i + 1,
        accountId: `p${i + 1}`,
        score: 19988 + i,
        timestamp: 1761065295 + i,
      })),
    mapInfoById: async (ids) =>
      ids.map((mapId) => ({ mapUid: `u-${mapId}`, mapId, name: `Map ${mapId}` })),
    mapRecords: async (mapId, accountIds) =>
      accountIds.map((accountId, i) => ({
        accountId,
        mapRecordId: `${mapId.slice(3)}-g${i + 1}`,
        mapId,
        timeMs: 19988 + i,
        timestamp: 't',
        url: `https://core.trackmania.nadeo.live/mapRecords/${mapId.slice(3)}-g${i + 1}/replay`,
        removed: false,
      })),
    mapRecord: async (id) => ({
      accountId: 'p9',
      mapRecordId: id,
      mapId: 'm9',
      timeMs: 19869,
      timestamp: '2026-10-28T09:00:00+00:00',
      url: `https://core.trackmania.nadeo.live/mapRecords/${id}/replay`,
      removed: id === 'gone',
    }),
    displayNames: async (ids) => Object.fromEntries(ids.map((id) => [id, id.toUpperCase()])),
    download: async (url) => new Uint8Array([url.length]),
  }

  const run = (client: NadeoClient, campaign: string, fs: FetchFs, sleep = async () => {}) =>
    fetchCommand(
      { client: tmx, nadeo: client, out: 'out', campaign, count: 2, uploads: false },
      fs,
      sleep,
    )

  test('downloads the top N of every campaign map in playlist order and indexes them by map uid', async () => {
    const { fs, files } = memFs()
    let sleeps = 0
    const lines = await run(nadeo, 'Fall 2026', fs, async () => {
      sleeps++
    })
    expect(lines[0]).toBe('Fall 2026: 2 maps')
    expect(lines.slice(1)).toEqual([
      'P1_(0019988)_fall-2026-01.Ghost.Gbx',
      'P2_(0019989)_fall-2026-01.Ghost.Gbx',
      'P1_(0019988)_fall-2026-02.Ghost.Gbx',
      'P2_(0019989)_fall-2026-02.Ghost.Gbx',
    ])
    expect(sleeps).toBe(3)
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(index['P1_(0019988)_fall-2026-01.Ghost.Gbx']).toEqual({
      recordId: 'u1-g1',
      replayId: null,
      position: 1,
      mapId: 0,
      mapUid: 'u1',
      recordTimeMs: 19988,
      accountId: 'p1',
      timestamp: 't',
    })
  })

  test('the campaign is matched by id or by name, case-insensitive', async () => {
    const byId = await run(nadeo, '150000', memFs().fs)
    expect(byId[0]).toBe('Summer 2026: 1 maps')
    const byName = await run(nadeo, 'summer 2026', memFs().fs)
    expect(byName[0]).toBe('Summer 2026: 1 maps')
    await expect(run(nadeo, 'Winter 2026', memFs().fs)).rejects.toThrow(
      /Winter 2026 not found.*Fall 2026, Summer 2026/,
    )
  })

  test('a file already in the out dir is kept and indexed without a download', async () => {
    const { fs, files } = memFs()
    files.set('out/P1_(0019988)_fall-2026-01.Ghost.Gbx', new Uint8Array([9]))
    let downloads = 0
    const counting: NadeoClient = {
      ...nadeo,
      download: async (url) => {
        downloads++
        return nadeo.download(url)
      },
    }
    const lines = await run(counting, 'Fall 2026', fs)
    expect(downloads).toBe(3)
    expect(files.get('out/P1_(0019988)_fall-2026-01.Ghost.Gbx')).toEqual(new Uint8Array([9]))
    expect(lines).toContain('P1_(0019988)_fall-2026-01.Ghost.Gbx kept')
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(index['P1_(0019988)_fall-2026-01.Ghost.Gbx'].position).toBe(1)
    expect(Object.keys(index)).toHaveLength(4)
  })

  test('the index is written after every file', async () => {
    const { fs, files } = memFs()
    let downloads = 0
    const failing: NadeoClient = {
      ...nadeo,
      download: async (url) => {
        if (++downloads === 3) {
          throw new Error('nadeo 429')
        }
        return nadeo.download(url)
      },
    }
    await expect(run(failing, 'Fall 2026', fs)).rejects.toThrow(/429/)
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(Object.keys(index)).toHaveLength(2)
  })

  test('--ghost downloads one record by id and indexes its account, stamp and map', async () => {
    const { fs, files } = memFs()
    const lines = await fetchCommand(
      { client: tmx, nadeo, out: 'out', ghost: 'r9', count: 1, uploads: false },
      fs,
      async () => {},
    )
    expect(lines).toEqual(['P9_(0019869)_map-m9.Ghost.Gbx'])
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(index['P9_(0019869)_map-m9.Ghost.Gbx']).toEqual({
      recordId: 'r9',
      replayId: null,
      position: 0,
      mapId: 0,
      mapUid: 'u-m9',
      recordTimeMs: 19869,
      accountId: 'p9',
      timestamp: '2026-10-28T09:00:00+00:00',
    })
    expect(files.get('out/P9_(0019869)_map-m9.Ghost.Gbx')).toEqual(
      new Uint8Array(['https://core.trackmania.nadeo.live/mapRecords/r9/replay'.length]),
    )
  })

  test('--ghost marks a record the leaderboard removed', async () => {
    const { fs } = memFs()
    const lines = await fetchCommand(
      { client: tmx, nadeo, out: 'out', ghost: 'gone', count: 1, uploads: false },
      fs,
      async () => {},
    )
    expect(lines).toEqual(['P9_(0019869)_map-m9.Ghost.Gbx removed'])
  })

  test('--ghost without nadeo credentials rejects', async () => {
    const { fs } = memFs()
    await expect(
      fetchCommand(
        { client: tmx, out: 'out', ghost: 'r9', count: 1, uploads: false },
        fs,
        async () => {},
      ),
    ).rejects.toThrow(/NADEO_LOGIN/)
  })

  test('campaign without nadeo credentials rejects', async () => {
    const { fs } = memFs()
    await expect(
      fetchCommand(
        { client: tmx, out: 'out', campaign: 'Fall 2026', count: 1, uploads: false },
        fs,
        async () => {},
      ),
    ).rejects.toThrow(/NADEO_LOGIN/)
  })
})
