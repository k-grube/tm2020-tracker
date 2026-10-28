// cloudflare worker: cors proxy for the page, GET /?url=<https tmx or trackmania.io url>
// env ALLOWED_ORIGINS: comma separated page origins, default is the github pages origin

const DIGITS = /^\d{1,6}$/
const PAGE_LENGTH = /^([1-9]\d?|100)$/

// host, path, allowed query keys with their value pattern (null: no query at all), edge cache seconds
const RULES = [
  {
    host: 'trackmania.exchange',
    path: /^\/(getonlinerecord|recordgbx)\/[A-Za-z0-9-]+$/,
    query: null,
    cache: 86400,
  },
  {
    host: 'trackmania.exchange',
    path: /^\/api\/maps\/getonlinerecords$/,
    query: { mapId: DIGITS, count: PAGE_LENGTH },
    cache: 300,
  },
  {
    host: 'trackmania.io',
    path: /^\/api\/download\/ghost\/[A-Za-z0-9-]+$/,
    query: null,
    cache: 86400,
  },
  { host: 'trackmania.io', path: /^\/api\/campaigns\/seasonal\/\d+$/, query: null, cache: 300 },
  { host: 'trackmania.io', path: /^\/api\/campaign\/seasonal\/\d+$/, query: null, cache: 300 },
  {
    host: 'trackmania.io',
    path: /^\/api\/leaderboard\/map\/[A-Za-z0-9_-]+$/,
    query: { offset: DIGITS, length: PAGE_LENGTH },
    cache: 300,
  },
]
const DEFAULT_ORIGINS = 'https://k-grube.github.io'
const USER_AGENT = 'tm2020-tracker/0.1 (+https://github.com/k-grube/tm2020-tracker)'

function reply(status, body, cors, extra = {}) {
  return new Response(body, { status, headers: { ...cors, ...extra } })
}

function matchRule(target) {
  for (const rule of RULES) {
    if (rule.host !== target.hostname || !rule.path.test(target.pathname)) {
      continue
    }
    const params = [...target.searchParams.entries()]
    if (rule.query === null) {
      return params.length === 0 ? rule : null
    }
    const ok = params.every(([k, v]) => rule.query[k] !== undefined && rule.query[k].test(v))
    return ok ? rule : null
  }
  return null
}

export default {
  async fetch(request, env) {
    const origins = (env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS).split(',').map((s) => s.trim())
    const origin = request.headers.get('Origin') ?? ''
    if (!origins.includes(origin)) {
      return new Response('origin not allowed', { status: 403 })
    }
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    if (request.method === 'OPTIONS') {
      return reply(204, null, cors, {
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Max-Age': '86400',
      })
    }
    if (request.method !== 'GET') {
      return reply(405, 'GET only', cors)
    }
    const raw = new URL(request.url).searchParams.get('url')
    let target
    try {
      target = new URL(raw ?? '')
    } catch {
      return reply(400, 'url parameter missing or invalid', cors)
    }
    const rule = target.protocol === 'https:' && !raw.includes('..') ? matchRule(target) : null
    if (!rule) {
      return reply(403, 'url not allowed', cors)
    }
    const upstream = await fetch(target.toString(), { headers: { 'User-Agent': USER_AGENT } })
    if (!upstream.ok) {
      return reply(502, `upstream ${upstream.status}`, cors)
    }
    const headers = new Headers(cors)
    headers.set('Content-Type', upstream.headers.get('Content-Type') ?? 'application/octet-stream')
    headers.set('Cache-Control', `public, max-age=${rule.cache}`)
    const disposition = upstream.headers.get('Content-Disposition')
    if (disposition) {
      headers.set('Content-Disposition', disposition)
      headers.set('Access-Control-Expose-Headers', 'Content-Disposition')
    }
    return new Response(upstream.body, { status: 200, headers })
  },
}
