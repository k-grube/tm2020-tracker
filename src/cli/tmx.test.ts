import { describe, expect, test } from 'vitest'
import { createTmxClient, sanitizeFilename, type TmxClient } from './tmx.ts'
import { fetchCommand, type FetchFs } from './fetch.ts'

interface Route {
  status?: number
  json?: unknown
  bytes?: number[]
  headers?: Record<string, string>
}

function stubFetch(routes: (url: string) => Route) {
  const calls: { url: string; headers: Record<string, string> }[] = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} })
    const route = routes(url)
    const body =
      route.json !== undefined ? JSON.stringify(route.json) : new Uint8Array(route.bytes ?? [])
    return new Response(body, { status: route.status ?? 200, headers: route.headers })
  }) as typeof fetch
  return { fetchFn, calls }
}

const UA = 'tm2020-tracker-test'

describe('createTmxClient', () => {
  test('searchMaps builds the url with fields and sends the user-agent', async () => {
    const { fetchFn, calls } = stubFetch(() => ({
      json: { More: false, Results: [{ MapId: 1, Name: 'A', MapUid: 'u' }] },
    }))
    const maps = await createTmxClient(fetchFn, UA).searchMaps('Spring 2025 - 03', 3)
    expect(maps).toEqual([{ MapId: 1, Name: 'A', MapUid: 'u' }])
    expect(calls[0]!.url).toBe(
      'https://trackmania.exchange/api/maps?name=Spring+2025+-+03&fields=MapId%2CName%2CMapUid&count=3',
    )
    expect(calls[0]!.headers['User-Agent']).toBe(UA)
  })

  test('listReplays follows More with an after cursor until count is reached', async () => {
    const page = (from: number, n: number, more: boolean) => ({
      More: more,
      Results: Array.from({ length: n }, (_, i) => ({ ReplayId: from + i, ReplayTime: 1000 })),
    })
    const { fetchFn, calls } = stubFetch((url) =>
      url.includes('after=') ? { json: page(100, 50, false) } : { json: page(0, 100, true) },
    )
    const replays = await createTmxClient(fetchFn, UA).listReplays(1, 150)
    expect(replays).toHaveLength(150)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.url).toContain('after=99')
    expect(calls[0]!.url).toContain('mapId=1')
  })

  test('listOnlineRecords returns Results', async () => {
    const { fetchFn, calls } = stubFetch(() => ({
      json: {
        Results: [
          {
            Position: 1,
            RecordTime: 20848,
            RecordId: 'r1',
            DisplayName: 'x',
            AccountId: 'a',
            RecordAt: 't',
          },
        ],
      },
    }))
    const records = await createTmxClient(fetchFn, UA).listOnlineRecords(348783, 50)
    expect(records[0]!.RecordId).toBe('r1')
    expect(calls[0]!.url).toBe(
      'https://trackmania.exchange/api/maps/getonlinerecords?mapId=348783&count=50',
    )
  })

  test('downloadOnlineRecord uses the content-disposition filename', async () => {
    const { fetchFn, calls } = stubFetch(() => ({
      bytes: [1, 2, 3],
      headers: { 'content-disposition': 'attachment; filename="Slidrz_(00:24:794)_x.Ghost.Gbx"' },
    }))
    const dl = await createTmxClient(fetchFn, UA).downloadOnlineRecord('abc-uuid')
    expect(calls[0]!.url).toBe('https://trackmania.exchange/getonlinerecord/abc-uuid')
    expect(dl.filename).toBe('Slidrz_(0024794)_x.Ghost.Gbx')
    expect(Array.from(dl.bytes)).toEqual([1, 2, 3])
  })

  test('downloadReplay falls back to a generated filename', async () => {
    const { fetchFn } = stubFetch(() => ({ bytes: [9] }))
    const dl = await createTmxClient(fetchFn, UA).downloadReplay(151406)
    expect(dl.filename).toBe('tmx-151406.Replay.Gbx')
  })

  test('non-200 rejects with status and url', async () => {
    const { fetchFn } = stubFetch(() => ({ status: 404 }))
    await expect(createTmxClient(fetchFn, UA).searchMaps('x')).rejects.toThrow(/404.*api\/maps/)
  })

  test('sanitizeFilename keeps only safe characters', () => {
    expect(sanitizeFilename('a b/c:d$e(f).Gbx')).toBe('abcde(f).Gbx')
  })
})

describe('fetchCommand', () => {
  function memFs(initial: Record<string, string> = {}) {
    const files = new Map<string, Uint8Array | string>(Object.entries(initial))
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

  function clientStub(): TmxClient {
    return {
      searchMaps: async () => [],
      listReplays: async () => [],
      listOnlineRecords: async () => [
        {
          Position: 1,
          RecordTime: 20848,
          DisplayName: 'A',
          AccountId: 'a',
          RecordId: 'r1',
          RecordAt: 't1',
        },
        {
          Position: 2,
          RecordTime: 20873,
          DisplayName: 'B',
          AccountId: 'b',
          RecordId: 'r2',
          RecordAt: 't2',
        },
      ],
      downloadOnlineRecord: async (id) => ({
        filename: `${id}.Ghost.Gbx`,
        bytes: new Uint8Array([1]),
      }),
      downloadReplay: async (id) => ({
        filename: `tmx-${id}.Replay.Gbx`,
        bytes: new Uint8Array([2]),
      }),
    }
  }

  test('writes files and merges index.json', async () => {
    const existing = {
      'old.Ghost.Gbx': { recordId: 'old', replayId: null, position: 9, mapId: 5, recordTimeMs: 1 },
    }
    const { fs, files } = memFs({ 'out/index.json': JSON.stringify(existing) })
    await fetchCommand(
      { client: clientStub(), out: 'out', map: 348783, count: 50, uploads: false },
      fs,
      async () => {},
    )
    expect(files.has('out/r1.Ghost.Gbx')).toBe(true)
    expect(files.has('out/r2.Ghost.Gbx')).toBe(true)
    const index = JSON.parse(files.get('out/index.json') as string)
    expect(index['old.Ghost.Gbx']).toEqual(existing['old.Ghost.Gbx'])
    expect(index['r1.Ghost.Gbx']).toEqual({
      recordId: 'r1',
      replayId: null,
      position: 1,
      mapId: 348783,
      recordTimeMs: 20848,
    })
  })
})
