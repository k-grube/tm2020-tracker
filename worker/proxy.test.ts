import { afterEach, describe, expect, test, vi } from 'vitest'
import worker from './proxy.js'

const env = { ALLOWED_ORIGINS: 'https://k-grube.github.io,http://localhost:5173' }
const ORIGIN = 'https://k-grube.github.io'
const TMX = 'https://trackmania.exchange/getonlinerecord/e9beeecb-c76a-44dc-93db-e733acbd3998'

function call(url: string, init: RequestInit = {}, origin = ORIGIN) {
  const headers = new Headers(init.headers)
  headers.set('Origin', origin)
  return worker.fetch(new Request(url, { ...init, headers }), env)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('proxy worker', () => {
  test('preflight answers with the caller origin and GET only', async () => {
    const res = await call('https://proxy.test/?url=x', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET')
  })

  test('streams an allowed tmx download with cors headers and the filename', async () => {
    const upstream = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe(TMX)
      expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/tm2020-tracker/)
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          'Content-Type': 'application/x-gbx',
          'Content-Disposition': 'attachment; filename="Slidrz.Ghost.Gbx"',
        },
      })
    })
    vi.stubGlobal('fetch', upstream)
    const res = await call(`https://proxy.test/?url=${encodeURIComponent(TMX)}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition')
    expect(res.headers.get('Content-Disposition')).toContain('Slidrz.Ghost.Gbx')
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual([1, 2, 3])
  })

  test('allows trackmania.io ghost downloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([9]))),
    )
    const url = 'https://trackmania.io/api/download/ghost/78969e3c-a39f-4180-bbd3-089152ce98c0'
    const res = await call(`https://proxy.test/?url=${encodeURIComponent(url)}`)
    expect(res.status).toBe(200)
  })

  test('rejects other hosts, other paths, http and missing url without calling upstream', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    for (const bad of [
      'https://example.com/getonlinerecord/x',
      'https://trackmania.exchange/api/maps',
      'http://trackmania.exchange/getonlinerecord/x',
      'https://trackmania.exchange/getonlinerecord/../x',
    ]) {
      const res = await call(`https://proxy.test/?url=${encodeURIComponent(bad)}`)
      expect(res.status, bad).toBe(403)
    }
    expect((await call('https://proxy.test/')).status).toBe(400)
    expect((await call('https://proxy.test/?url=not a url')).status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })

  test('rejects an origin outside the list and non-GET methods', async () => {
    const res = await call(
      `https://proxy.test/?url=${encodeURIComponent(TMX)}`,
      {},
      'https://evil.test',
    )
    expect(res.status).toBe(403)
    expect((await call('https://proxy.test/?url=x', { method: 'POST' })).status).toBe(405)
  })

  test('passes an upstream failure through as 502 with its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    const res = await call(`https://proxy.test/?url=${encodeURIComponent(TMX)}`)
    expect(res.status).toBe(502)
    expect(await res.text()).toContain('404')
  })
})

describe('trackmania.io api passthrough', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

  test('allows the campaign list, a campaign and a map leaderboard, keeping the json content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ok: 1 })),
    )
    for (const url of [
      'https://trackmania.io/api/campaigns/seasonal/0',
      'https://trackmania.io/api/campaign/seasonal/157584',
      'https://trackmania.io/api/leaderboard/map/ypPmohQofd72MyTsIsijKfrJH98?offset=0&length=25',
    ]) {
      const res = await call(`https://proxy.test/?url=${encodeURIComponent(url)}`)
      expect(res.status, url).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('application/json')
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
      expect(await res.json()).toEqual({ ok: 1 })
    }
  })

  test('rejects other query parameters, long pages and other api paths', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    for (const bad of [
      'https://trackmania.io/api/leaderboard/map/abc?offset=0&length=25&x=1',
      'https://trackmania.io/api/leaderboard/map/abc?offset=0&length=500',
      'https://trackmania.io/api/campaigns/seasonal/0?x=1',
      'https://trackmania.io/api/players/find?search=x',
      'https://trackmania.io/api/campaign/157584',
    ]) {
      const res = await call(`https://proxy.test/?url=${encodeURIComponent(bad)}`)
      expect(res.status, bad).toBe(403)
    }
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('tmx api passthrough', () => {
  test('allows the online records listing with mapId and count only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"Results":[]}', { headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    const ok = await call(
      `https://proxy.test/?url=${encodeURIComponent('https://trackmania.exchange/api/maps/getonlinerecords?mapId=151406&count=25')}`,
    )
    expect(ok.status).toBe(200)
    expect(ok.headers.get('Content-Type')).toContain('application/json')
    for (const bad of [
      'https://trackmania.exchange/api/maps/getonlinerecords?mapId=151406&count=25&fields=x',
      'https://trackmania.exchange/api/maps/getonlinerecords?mapId=abc&count=25',
      'https://trackmania.exchange/api/maps?count=1',
    ]) {
      expect((await call(`https://proxy.test/?url=${encodeURIComponent(bad)}`)).status, bad).toBe(
        403,
      )
    }
  })
})
