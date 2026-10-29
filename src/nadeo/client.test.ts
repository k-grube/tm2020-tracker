import { describe, expect, test } from 'vitest'
import {
  CORE_BASE,
  LIVE_BASE,
  OAUTH_BASE,
  createNadeoClient,
  replayUrl,
  stripFormat,
  type NadeoClientOptions,
} from './client.ts'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

interface Route {
  status?: number
  json?: unknown
  bytes?: number[]
  headers?: Record<string, string>
}

const jwt = (exp: number): string =>
  `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.s`

function stub(routes: (call: Call) => Route) {
  const calls: Call[] = []
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers as Record<string, string>) ?? {},
      body: typeof init?.body === 'string' ? init.body : null,
    }
    calls.push(call)
    const route = routes(call)
    const body =
      route.json !== undefined ? JSON.stringify(route.json) : new Uint8Array(route.bytes ?? [])
    return new Response(body, { status: route.status ?? 200, headers: route.headers })
  }) as typeof fetch
  return { fetchFn, calls }
}

const AUTH = `${CORE_BASE}/v2/authentication/token/basic`
const REFRESH = `${CORE_BASE}/v2/authentication/token/refresh`
const UA = 'tm2020-tracker-test'
const CREDS = { login: 'srv', password: 'pw' }

// tokens that stay valid, any api call answers with an empty list
function tokens(call: Call, exp = 4e9): Route | null {
  if (call.url === AUTH) {
    const aud = (JSON.parse(call.body ?? '{}') as { audience: string }).audience
    return { json: { accessToken: jwt(exp), refreshToken: `r-${aud}` } }
  }
  return null
}

function client(
  fetchFn: typeof fetch,
  extra: Partial<NadeoClientOptions> = {},
): ReturnType<typeof createNadeoClient> {
  return createNadeoClient({
    fetchFn,
    userAgent: UA,
    credentials: CREDS,
    gapMs: 0,
    sleep: async () => {},
    ...extra,
  })
}

describe('authentication', () => {
  test('one basic auth per audience, api calls carry the nadeo_v1 token and the user agent', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ??
        (c.url.startsWith(CORE_BASE) ? { json: [] } : { json: { campaignList: [], mapList: [] } }),
    )
    const c = client(fetchFn)
    await c.campaigns(1)
    await c.mapInfo(['u1'])
    await c.mapRecords('m1', ['a1'])
    const auths = calls.filter((c) => c.url === AUTH)
    expect(auths.map((a) => a.body)).toEqual([
      '{"audience":"NadeoLiveServices"}',
      '{"audience":"NadeoServices"}',
    ])
    expect(auths[0]!.method).toBe('POST')
    expect(auths[0]!.headers['Authorization']).toBe(`Basic ${btoa('srv:pw')}`)
    expect(auths[0]!.headers['Content-Type']).toBe('application/json')
    expect(auths[0]!.headers['User-Agent']).toBe(UA)
    const api = calls.filter((c) => c.url !== AUTH)
    expect(api).toHaveLength(3)
    for (const call of api) {
      expect(call.headers['User-Agent']).toBe(UA)
    }
    expect(api[0]!.headers['Authorization']).toBe(`nadeo_v1 t=${jwt(4e9)}`)
    expect(api[0]!.url.startsWith(LIVE_BASE)).toBe(true)
    expect(api[2]!.url.startsWith(CORE_BASE)).toBe(true)
  })

  test('a token within a minute of expiry is refreshed, a failed refresh falls back to basic auth', async () => {
    let now = 1_000_000
    let refreshOk = true
    const { fetchFn, calls } = stub((c) => {
      if (c.url === AUTH) {
        return { json: { accessToken: jwt(now + 90), refreshToken: 'r1' } }
      }
      if (c.url === REFRESH) {
        return refreshOk
          ? { json: { accessToken: jwt(now + 3600), refreshToken: 'r2' } }
          : { status: 401, json: {} }
      }
      return { json: { campaignList: [] } }
    })
    const c = client(fetchFn, { now: () => now * 1000 })
    await c.campaigns(1)
    now += 40
    await c.campaigns(1)
    expect(calls.map((c) => c.url)).toEqual([
      AUTH,
      `${LIVE_BASE}/api/campaign/official?offset=0&length=1`,
      REFRESH,
      `${LIVE_BASE}/api/campaign/official?offset=0&length=1`,
    ])
    expect(calls[2]!.method).toBe('POST')
    expect(calls[2]!.headers['Authorization']).toBe('nadeo_v1 t=r1')
    expect(calls[3]!.headers['Authorization']).toBe(`nadeo_v1 t=${jwt(now + 3600)}`)
    now += 3600
    refreshOk = false
    await c.campaigns(1)
    expect(calls.slice(4).map((c) => c.url)).toEqual([
      REFRESH,
      AUTH,
      `${LIVE_BASE}/api/campaign/official?offset=0&length=1`,
    ])
  })

  test('a failed authentication rejects with the status', async () => {
    const { fetchFn } = stub(() => ({ status: 401, json: { message: 'nope' } }))
    await expect(client(fetchFn).campaigns(1)).rejects.toThrow(/nadeo 401.*token\/basic/)
  })
})

describe('endpoints', () => {
  test('campaigns lists the official campaigns with their playlist in position order', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ?? {
          json: {
            campaignList: [
              {
                id: 157584,
                name: 'Fall 2026',
                playlist: [
                  { position: 1, mapUid: 'u2' },
                  { position: 0, mapUid: 'u1' },
                ],
              },
              { id: 150000, name: 'Summer 2026', playlist: [] },
            ],
          },
        },
    )
    expect(await client(fetchFn).campaigns(50)).toEqual([
      { id: 157584, name: 'Fall 2026', mapUids: ['u1', 'u2'] },
      { id: 150000, name: 'Summer 2026', mapUids: [] },
    ])
    expect(calls[1]!.url).toBe(`${LIVE_BASE}/api/campaign/official?offset=0&length=50`)
  })

  test('mapInfo resolves uids to ids and plain names, 100 uids per request', async () => {
    const { fetchFn, calls } = stub((c) => {
      const t = tokens(c)
      if (t) {
        return t
      }
      const uids = new URL(c.url).searchParams.get('mapUidList')!.split(',')
      return {
        json: {
          mapList: uids.map((uid) => ({ uid, mapId: `id-${uid}`, name: `$o$f00${uid}$z map` })),
        },
      }
    })
    const uids = Array.from({ length: 101 }, (_, i) => `u${i}`)
    const maps = await client(fetchFn).mapInfo(uids)
    expect(maps).toHaveLength(101)
    expect(maps[0]).toEqual({ mapUid: 'u0', mapId: 'id-u0', name: 'u0 map' })
    const urls = calls.filter((c) => c.url !== AUTH).map((c) => c.url)
    expect(urls).toHaveLength(2)
    expect(urls[0]!.startsWith(`${LIVE_BASE}/api/token/map/get-multiple?mapUidList=u0,u1,`)).toBe(
      true,
    )
    expect(urls[1]).toBe(`${LIVE_BASE}/api/token/map/get-multiple?mapUidList=u100`)
  })

  test('leaderboard asks the world top of the personal best group', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ?? {
          json: {
            tops: [
              {
                zoneName: 'World',
                top: [
                  {
                    accountId: 'a1',
                    zoneName: 'X',
                    position: 1,
                    score: 19988,
                    timestamp: 1761065295,
                  },
                  {
                    accountId: 'a2',
                    zoneName: 'Y',
                    position: 2,
                    score: 20001,
                    timestamp: 1761065300,
                  },
                ],
              },
            ],
          },
        },
    )
    expect(await client(fetchFn).leaderboard('u1', 25)).toEqual([
      { position: 1, accountId: 'a1', score: 19988, timestamp: 1761065295 },
      { position: 2, accountId: 'a2', score: 20001, timestamp: 1761065300 },
    ])
    expect(calls[1]!.url).toBe(
      `${LIVE_BASE}/api/token/leaderboard/group/Personal_Best/map/u1/top?onlyWorld=true&length=25&offset=0`,
    )
    const empty = stub((c) => tokens(c) ?? { json: {} })
    expect(await client(empty.fetchFn).leaderboard('bad', 25)).toEqual([])
  })

  test('mapRecords fetches the records of the accounts on one map', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ?? {
          json: [
            {
              accountId: 'a1',
              mapId: 'm1',
              mapRecordId: 'r1',
              recordScore: { respawnCount: 4294967295, score: 0, time: 19988 },
              removed: false,
              timestamp: '2026-10-21T16:48:15+00:00',
              url: 'https://core.trackmania.nadeo.live/mapRecords/r1/replay',
            },
          ],
        },
    )
    expect(await client(fetchFn).mapRecords('m1', ['a1', 'a2'])).toEqual([
      {
        accountId: 'a1',
        mapRecordId: 'r1',
        mapId: 'm1',
        timeMs: 19988,
        timestamp: '2026-10-21T16:48:15+00:00',
        url: 'https://core.trackmania.nadeo.live/mapRecords/r1/replay',
        removed: false,
      },
    ])
    expect(calls[1]!.url).toBe(
      `${CORE_BASE}/v2/mapRecords/by-account/?accountIdList=a1,a2&mapId=m1`,
    )
  })

  test('mapRecord fetches one record by id, removed records included', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ?? {
          json: {
            accountId: 'a1',
            mapId: 'm1',
            mapRecordId: 'r1',
            recordScore: { respawnCount: 0, score: 0, time: 19869 },
            removed: true,
            timestamp: '2026-10-28T09:00:00+00:00',
            url: 'https://core.trackmania.nadeo.live/mapRecords/r1/replay',
          },
        },
    )
    expect(await client(fetchFn).mapRecord('R1')).toEqual({
      accountId: 'a1',
      mapRecordId: 'r1',
      mapId: 'm1',
      timeMs: 19869,
      timestamp: '2026-10-28T09:00:00+00:00',
      url: 'https://core.trackmania.nadeo.live/mapRecords/r1/replay',
      removed: true,
    })
    expect(calls[1]!.url).toBe(`${CORE_BASE}/mapRecords/r1`)
    expect(calls[1]!.headers['Authorization']).toBe(`nadeo_v1 t=${jwt(4e9)}`)
  })

  test('mapInfoById resolves map ids through the core api', async () => {
    const { fetchFn, calls } = stub(
      (c) =>
        tokens(c) ?? {
          json: [{ mapId: 'm1', mapUid: 'u1', name: '$f00Fall 2026 - 01', author: 'x' }],
        },
    )
    expect(await client(fetchFn).mapInfoById(['m1', 'm2'])).toEqual([
      { mapUid: 'u1', mapId: 'm1', name: 'Fall 2026 - 01' },
    ])
    expect(calls[1]!.url).toBe(`${CORE_BASE}/maps/by-id/?mapIdList=m1,m2`)
    expect(calls[0]!.body).toBe('{"audience":"NadeoServices"}')
  })

  test('download returns the bytes', async () => {
    const { fetchFn, calls } = stub(() => ({ bytes: [0x47, 0x42, 0x58] }))
    const bytes = await client(fetchFn).download(replayUrl('R1'))
    expect(Array.from(bytes)).toEqual([0x47, 0x42, 0x58])
    expect(calls[0]!.url).toBe('https://core.trackmania.nadeo.live/mapRecords/r1/replay')
    expect(calls[0]!.headers['User-Agent']).toBe(UA)
    expect(calls[0]!.headers['Authorization']).toBeUndefined()
  })
})

describe('displayNames', () => {
  test('without oauth credentials nothing is requested', async () => {
    const { fetchFn, calls } = stub(() => ({ json: {} }))
    expect(await client(fetchFn).displayNames(['a1'])).toEqual({})
    expect(calls).toHaveLength(0)
  })

  test('with oauth credentials a client token is fetched once, names come 50 ids per request', async () => {
    const { fetchFn, calls } = stub((c) => {
      if (c.url === `${OAUTH_BASE}/api/access_token`) {
        return { json: { token_type: 'bearer', expires_in: 3600, access_token: 'oa' } }
      }
      const ids = new URL(c.url).searchParams.getAll('accountId[]')
      return { json: Object.fromEntries(ids.map((id) => [id, `N${id}`])) }
    })
    const c = client(fetchFn, { oauth: { clientId: 'cid', clientSecret: 'sec' } })
    const ids = Array.from({ length: 51 }, (_, i) => `a${i}`)
    const names = await c.displayNames(ids)
    expect(Object.keys(names)).toHaveLength(51)
    expect(names['a50']).toBe('Na50')
    expect(calls[0]!.method).toBe('POST')
    expect(calls[0]!.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(calls[0]!.body).toBe('grant_type=client_credentials&client_id=cid&client_secret=sec')
    expect(calls[1]!.headers['Authorization']).toBe('Bearer oa')
    expect(new URL(calls[1]!.url).searchParams.getAll('accountId[]')).toHaveLength(50)
    expect(new URL(calls[2]!.url).searchParams.getAll('accountId[]')).toEqual(['a50'])
    await c.displayNames(['a0'])
    expect(calls.filter((c) => c.url.endsWith('/access_token'))).toHaveLength(1)
  })
})

describe('pacing', () => {
  test('consecutive requests wait for the gap, auth included', async () => {
    let now = 0
    const waits: number[] = []
    const { fetchFn } = stub((c) => tokens(c) ?? { json: { campaignList: [] } })
    const c = client(fetchFn, {
      gapMs: 1000,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms)
        now += ms
      },
    })
    await c.campaigns(1)
    now += 300
    await c.campaigns(1)
    expect(waits).toEqual([1000, 700])
  })

  test('a 429 is retried after retry-after or growing waits, then rejects', async () => {
    let n = 0
    const { fetchFn, calls } = stub(
      (c) => tokens(c) ?? (n++ < 2 ? { status: 429 } : { json: { campaignList: [] } }),
    )
    const waits: number[] = []
    const c = client(fetchFn, {
      sleep: async (ms) => {
        waits.push(ms)
      },
    })
    expect(await c.campaigns(1)).toEqual([])
    expect(calls).toHaveLength(4)
    expect(waits).toEqual([5000, 15000])
    const after = stub((c) => tokens(c) ?? { status: 429, headers: { 'Retry-After': '20' } })
    const w2: number[] = []
    await expect(
      client(after.fetchFn, {
        sleep: async (ms) => {
          w2.push(ms)
        },
      }).campaigns(1),
    ).rejects.toThrow(/nadeo 429/)
    expect(w2).toEqual([20000, 20000, 20000, 20000, 20000])
  })

  test('other failures reject with status and url', async () => {
    const { fetchFn } = stub((c) => tokens(c) ?? { status: 503 })
    await expect(client(fetchFn).campaigns(1)).rejects.toThrow(/nadeo 503.*campaign\/official/)
  })
})

describe('helpers', () => {
  test('replayUrl lowercases the record id', () => {
    expect(replayUrl('78969E3C-A39F-4180-BBD3-089152CE98C0')).toBe(
      'https://core.trackmania.nadeo.live/mapRecords/78969e3c-a39f-4180-bbd3-089152ce98c0/replay',
    )
  })

  test('stripFormat drops color, style and link codes', () => {
    expect(stripFormat('$009L$00Aa$fffst $l[http://x]link$l $$')).toBe('Last link $')
    expect(stripFormat('Fall 2026 - 01')).toBe('Fall 2026 - 01')
  })
})
