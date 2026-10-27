import { parseArgs as nodeParseArgs } from 'node:util'

export interface CliArgs {
  command: string | null
  positionals: string[]
  flags: Record<string, string | boolean | undefined>
}

const OPTIONS = {
  json: { type: 'boolean' },
  events: { type: 'string' },
  out: { type: 'string' },
  map: { type: 'string' },
  ghost: { type: 'string' },
  search: { type: 'string' },
  count: { type: 'string' },
  uploads: { type: 'boolean' },
  baseline: { type: 'string' },
  ranks: { type: 'string' },
} as const

export function parseArgs(argv: string[]): CliArgs {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true,
  })
  const [command = null, ...rest] = positionals
  return { command, positionals: rest, flags: values }
}

export function intFlag(flags: CliArgs['flags'], name: string, fallback: number): number {
  const v = flags[name]
  if (typeof v !== 'string') {
    return fallback
  }
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) {
    throw new Error(`--${name} needs a number, got ${v}`)
  }
  return n
}
