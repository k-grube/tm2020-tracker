import { describe, expect, test } from 'vitest'
import { createTmioClient, kebab, type TmioClient } from './tmio.ts'
import { fetchCommand, type FetchFs } from './fetch.ts'
import type { TmxClient } from './tmx.ts'

interface Route {
  status?: number
  json?: unknown
  bytes?: number[]
}

function stubFetch(routes: (url: string) => Route) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} })
    const route = routes(url)
    const body =
      route.json !== undefined ? JSON.stringify(route.json) : new Uint8Array(route.bytes ?? [])
    return new Response(body, { status: route.status ?? 200 })
  }) as typeof fetch
  return { fetchFn, calls }
}

const UA = 'tm2020-tracker-test'

describe('kebab', () => {
  test('lowercases and joins words with single dashes', () => {
    expect(kebab('Fall 2026 - 01')).toBe('fall-2026-01')
    expect(kebab('  Vault of the Sun!! ')).toBe('vault-of-the-sun')
  })
})

describe('createTmioClient', () => {
  test('campaign returns the playlist maps and sends the user-agent', async () => {
    const { fetchFn, calls } = stubFetch(() => ({
      json: {
        name: 'Fall 2026',
        playlist: [
          { name: 'Fall 2026 - 01', mapUid: 'u1', authorScore: 1 },
          { name: 'Fall 2026 - 02', mapUid: 'u2', authorScore: 2 },
        ],
      },
    }))
    const c = await createTmioClient(fetchFn, UA).campaign(157584)
    expect(calls[0]!.url).toBe('https://trackmania.io/api/campaign/seasonal/157584')
    expect(calls[0]!.headers['User-Agent']).toBe(UA)
    expect(c).toEqual({
      name: 'Fall 2026',
      maps: [
        { name: 'Fall 2026 - 01', mapUid: 'u1' },
        { name: 'Fall 2026 - 02', mapUid: 'u2' },
      ],
    })
  })

  test('leaderboard asks for the top N of a map', async () => {
    const { fetchFn, calls } = stubFetch(() => ({
      json: {
        tops: [
          {
            player: { name: 'KarjeN', id: 'p1', zone: {} },
            position: 1,
            time: 19988,
            score: 19988,
            filename: 'x',
            timestamp: '2026-10-21T16:48:15+00:00',
            url: '/api/download/ghost/g1',
          },
        ],
      },
    }))
    const records = await createTmioClient(fetchFn, UA).leaderboard('u1', 3)
    expect(calls[0]!.url).toBe('https://trackmania.io/api/leaderboard/map/u1?offset=0&length=3')
    expect(records).toEqual([
      {
        position: 1,
        time: 19988,
        timestamp: '2026-10-21T16:48:15+00:00',
        url: '/api/download/ghost/g1',
        player: { name: 'KarjeN', id: 'p1' },
      },
    ])
  })

  test('downloadGhost fetches the record url and names the file after player, time and map', async () => {
    const { fetchFn, calls } = stubFetch(() => ({ bytes: [1, 2] }))
    const dl = await createTmioClient(fetchFn, UA).downloadGhost(
      '/api/download/ghost/g1',
      'Kar jeN/',
      19988,
      'Fall 2026 - 01',
    )
    expect(calls[0]!.url).toBe('https://trackmania.io/api/download/ghost/g1')
    expect(dl.filename).toBe('KarjeN_(0019988)_fall-2026-01.Ghost.Gbx')
    expect(Array.from(dl.bytes)).toEqual([1, 2])
  })

  test('retries a 429 after waiting, then gives up', async () => {
    let n = 0
    const { fetchFn, calls } = stubFetch(() => ({
      status: n++ < 2 ? 429 : 200,
      json: { name: 'c', playlist: [] },
    }))
    const waits: number[] = []
    const client = createTmioClient(fetchFn, UA, async (ms) => {
      waits.push(ms)
    })
    const c = await client.campaign(1)
    expect(c.maps).toEqual([])
    expect(calls).toHaveLength(3)
    expect(waits).toEqual([2000, 4000])
    n = 0
    const always = stubFetch(() => ({ status: 429 }))
    await expect(createTmioClient(always.fetchFn, UA, async () => {}).campaign(1)).rejects.toThrow(
      /429/,
    )
    expect(always.calls).toHaveLength(4)
  })

  test('non-200 rejects with status and url', async () => {
    const { fetchFn } = stubFetch(() => ({ status: 503 }))
    await expect(createTmioClient(fetchFn, UA).campaign(1)).rejects.toThrow(/503.*campaign/)
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

  const tmio: TmioClient = {
    campaign: async () => ({
      name: 'Fall 2026',
      maps: [
        { name: 'Fall 2026 - 01', mapUid: 'u1' },
        { name: 'Fall 2026 - 02', mapUid: 'u2' },
      ],
    }),
    leaderboard: async (mapUid, count) =>
      Array.from({ length: count }, (_, i) => ({
        position: i + 1,
        time: 19988 + i,
        timestamp: 't',
        url: `/api/download/ghost/${mapUid}-g${i + 1}`,
        player: { name: `P${i + 1}`, id: `p${i + 1}` },
      })),
    downloadGhost: async (url, player, time, map) => ({
      filename: `${player}_(${String(time).padStart(7, '0')})_${kebab(map)}.Ghost.Gbx`,
      bytes: new Uint8Array([url.length]),
    }),
  }

  test('downloads the top N of every campaign map and indexes them by map uid', async () => {
    const { fs, files } = memFs()
    let sleeps = 0
    const lines = await fetchCommand(
      { client: tmx, tmio, out: 'out', campaign: 157584, count: 2, uploads: false },
      fs,
      async () => {
        sleeps++
      },
    )
    expect(lines[0]).toBe('Fall 2026: 2 maps')
    expect(files.has('out/P1_(0019988)_fall-2026-01.Ghost.Gbx')).toBe(true)
    expect(files.has('out/P2_(0019989)_fall-2026-02.Ghost.Gbx')).toBe(true)
    expect(sleeps).toBe(3)
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(index['P1_(0019988)_fall-2026-01.Ghost.Gbx']).toEqual({
      recordId: 'u1-g1',
      replayId: null,
      position: 1,
      mapId: 0,
      mapUid: 'u1',
      recordTimeMs: 19988,
    })
  })

  test('campaign without a trackmania.io client rejects', async () => {
    const { fs } = memFs()
    await expect(
      fetchCommand(
        { client: tmx, out: 'out', campaign: 1, count: 1, uploads: false },
        fs,
        async () => {},
      ),
    ).rejects.toThrow(/trackmania\.io/)
  })
})
