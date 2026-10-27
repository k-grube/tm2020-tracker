import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { intFlag, parseArgs } from './args.ts'
import { readFileBytes, writeJson } from './io.ts'
import { baselineCommand } from './baseline.ts'
import { BASELINE_RANKS } from '../core/signals/constants.ts'
import { dumpFile, formatDump } from './dump.ts'
import { createTmxClient } from './tmx.ts'
import { fetchCommand, type FetchFs } from './fetch.ts'
import { analyzeCommand } from './analyze.ts'
import { formatReport } from './format-report.ts'
import type { Baseline } from '../core/signals/types.ts'

const USAGE = `usage:
  dump <file> [--json] [--events N]
  fetch (--map <tmxMapId> [--count N] [--uploads] | --ghost <uuid> | --search <name>) --out <dir>
  analyze <file|dir>... [--json] [--baseline <file>]
  baseline <dir> --out <file> [--ranks lo:hi]
`

const USER_AGENT = 'tm2020-tracker/0.1 (+https://github.com/grubekevin/tm2020-tracker)'
const DOWNLOAD_DELAY_MS = 250

const nodeFs: FetchFs = {
  writeFile: (path, data) => {
    writeFileSync(path, data)
  },
  readText: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
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
          out,
          map: typeof args.flags.map === 'string' ? intFlag(args.flags, 'map', 0) : undefined,
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
        args.flags.json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report),
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
