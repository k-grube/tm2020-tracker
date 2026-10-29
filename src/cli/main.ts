import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { intFlag, parseArgs } from './args.ts'
import { readFileBytes, writeJson } from './io.ts'
import { baselineCommand } from './baseline.ts'
import { BASELINE_RANKS } from '../core/signals/constants.ts'
import { dumpFile, formatDump } from './dump.ts'
import { createTmxClient } from './tmx.ts'
import { createNadeoClient, type NadeoClient } from '../nadeo/client.ts'
import { fetchCommand, type FetchFs } from './fetch.ts'
import { analyzeCommand } from './analyze.ts'
import { formatReport, formatSummary } from './format-report.ts'
import type { Baseline } from '../core/signals/types.ts'

const USAGE = `usage:
  dump <file> [--json] [--events N]
  fetch (--map <tmxMapId> [--count N] [--uploads] | --campaign <name|id> [--count N] | --ghost <recordId> | --search <name>) --out <dir>
  analyze <file|dir>... [--json | --summary] [--baseline <file>]
  baseline <dir> --out <file> [--ranks lo:hi]
`

const USER_AGENT = 'tm2020-tracker/0.1 (+https://github.com/k-grube/tm2020-tracker)'
const DOWNLOAD_DELAY_MS = 250
// a campaign pull runs minutes, one request a second is the sustained rate nadeo tolerates
const NADEO_GAP_MS = 1000

const nodeFs: FetchFs = {
  writeFile: (path, data) => {
    writeFileSync(path, data)
  },
  readText: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  exists: (path) => existsSync(path),
}

// credentials live in .env or .env.local (vite order, later wins): NADEO_LOGIN, NADEO_PASSWORD,
// optional TM_OAUTH_CLIENT_ID and TM_OAUTH_CLIENT_SECRET for display names
function nadeoFromEnv(): NadeoClient | undefined {
  for (const file of ['.env', '.env.local']) {
    if (existsSync(file)) {
      process.loadEnvFile(file)
    }
  }
  const { NADEO_LOGIN, NADEO_PASSWORD, TM_OAUTH_CLIENT_ID, TM_OAUTH_CLIENT_SECRET } = process.env
  if (!NADEO_LOGIN || !NADEO_PASSWORD) {
    return undefined
  }
  return createNadeoClient({
    fetchFn: fetch,
    userAgent: USER_AGENT,
    credentials: { login: NADEO_LOGIN, password: NADEO_PASSWORD },
    oauth:
      TM_OAUTH_CLIENT_ID && TM_OAUTH_CLIENT_SECRET
        ? { clientId: TM_OAUTH_CLIENT_ID, clientSecret: TM_OAUTH_CLIENT_SECRET }
        : null,
    gapMs: NADEO_GAP_MS,
  })
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv)
  switch (args.command) {
    case 'dump': {
      const file = args.positionals[0]
      if (!file) {
        process.stderr.write(USAGE)
        return 2
      }
      const result = await dumpFile(readFileBytes(file), {
        events: intFlag(args.flags, 'events', 20),
      })
      process.stdout.write(
        args.flags.json ? JSON.stringify(result, null, 2) + '\n' : formatDump(result),
      )
      return 0
    }
    case 'fetch': {
      const out = typeof args.flags.out === 'string' ? args.flags.out : '.'
      mkdirSync(out, { recursive: true })
      const lines = await fetchCommand(
        {
          client: createTmxClient(fetch, USER_AGENT),
          nadeo: nadeoFromEnv(),
          out,
          map: typeof args.flags.map === 'string' ? intFlag(args.flags, 'map', 0) : undefined,
          campaign: typeof args.flags.campaign === 'string' ? args.flags.campaign : undefined,
          count: intFlag(args.flags, 'count', 50),
          uploads: args.flags.uploads === true,
          ghost: typeof args.flags.ghost === 'string' ? args.flags.ghost : undefined,
          search: typeof args.flags.search === 'string' ? args.flags.search : undefined,
        },
        nodeFs,
        () => delay(DOWNLOAD_DELAY_MS),
      )
      process.stdout.write(lines.join('\n') + (lines.length ? '\n' : ''))
      return 0
    }
    case 'analyze': {
      if (args.positionals.length === 0) {
        process.stderr.write(USAGE)
        return 2
      }
      const baseline =
        typeof args.flags.baseline === 'string'
          ? (JSON.parse(readFileSync(args.flags.baseline, 'utf8')) as Baseline)
          : null
      const report = await analyzeCommand(args.positionals, baseline)
      process.stdout.write(
        args.flags.json
          ? JSON.stringify(report, null, 2) + '\n'
          : args.flags.summary
            ? formatSummary(report)
            : formatReport(report),
      )
      const failed = report.files.filter(
        (f) => f.signals[0]?.applicable === false && f.login === '',
      )
      return failed.length === report.files.length ? 1 : 0
    }
    case 'baseline': {
      const dir = args.positionals[0]
      const out = args.flags.out
      if (!dir || typeof out !== 'string') {
        process.stderr.write(USAGE)
        return 2
      }
      const ranksFlag = typeof args.flags.ranks === 'string' ? args.flags.ranks : null
      const ranks: [number, number] = ranksFlag
        ? (ranksFlag.split(':').map((x) => Number.parseInt(x, 10)) as [number, number])
        : BASELINE_RANKS
      const baseline = await baselineCommand(dir, { ranks })
      writeJson(out, baseline)
      process.stdout.write(`${baseline.files} files -> ${out}\n`)
      return 0
    }
    default:
      process.stderr.write(USAGE)
      return 2
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  },
)
