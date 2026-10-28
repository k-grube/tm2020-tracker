// cloudflare worker: cors proxy for ghost downloads, GET /?url=<https tmx or trackmania.io download>
// env ALLOWED_ORIGINS: comma separated page origins, default is the github pages origin

const ALLOWED_PATHS = new Map([
  ['trackmania.exchange', /^\/(getonlinerecord|recordgbx)\/[A-Za-z0-9-]+$/],
  ['trackmania.io', /^\/api\/download\/ghost\/[A-Za-z0-9-]+$/],
])
const DEFAULT_ORIGINS = 'https://k-grube.github.io'
const USER_AGENT = 'tm2020-tracker/0.1 (+https://github.com/k-grube/tm2020-tracker)'

function reply(status, body, cors, extra = {}) {
  return new Response(body, { status, headers: { ...cors, ...extra } })
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
    const path = ALLOWED_PATHS.get(target.hostname)
    if (
      target.protocol !== 'https:' ||
      !path ||
      !path.test(target.pathname) ||
      raw.includes('..')
    ) {
      return reply(403, 'url not allowed', cors)
    }
    const upstream = await fetch(target.toString(), { headers: { 'User-Agent': USER_AGENT } })
    if (!upstream.ok) {
      return reply(502, `upstream ${upstream.status}`, cors)
    }
    const headers = new Headers(cors)
    headers.set('Content-Type', 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=86400')
    const disposition = upstream.headers.get('Content-Disposition')
    if (disposition) {
      headers.set('Content-Disposition', disposition)
      headers.set('Access-Control-Expose-Headers', 'Content-Disposition')
    }
    return new Response(upstream.body, { status: 200, headers })
  },
}
