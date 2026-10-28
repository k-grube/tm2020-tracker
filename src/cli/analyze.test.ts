import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { analyzeBytes } from '../core/pipeline.ts'
import { formatReport } from './format-report.ts'
import { inflateNode } from './inflate.ts'
import { fixturePath, loadFixture } from '../test/fixtures.ts'
import { minimalGhostGbx } from '../test/minimal-ghost.ts'

const ALL_IDS = [
  'wall_time_ratio',
  'wall_time_delta',
  'ticks_vs_racetime',
  'same_tick_toggle',
  'steer_spikes_per_sec',
  'input_density',
  'steer_device',
  'steer_repetition',
  'trajectory_overlap',
  'checkpoint_split_match',
  'metadata',
]

describe('analyzeBytes', () => {
  test('slidrz gives one file report with all eleven signal ids', async () => {
    const report = await analyzeBytes(
      [{ name: 'slidrz', bytes: loadFixture('slidrz') }],
      null,
      inflateNode,
    )
    expect(report.files).toHaveLength(1)
    const f = report.files[0]!
    expect(f.signals.map((s) => s.id).sort()).toEqual([...ALL_IDS].sort())
    expect(f.signals.find((s) => s.id === 'trajectory_overlap')!.applicable).toBe(false)
    expect(f.signals.find((s) => s.id === 'checkpoint_split_match')!.applicable).toBe(false)
    expect(f.raceTimeMs).toBe(24794)
    expect(f.summary.needsHumanReview).toBe(false)
  })

  test('output never contains the word cheat', async () => {
    const report = await analyzeBytes(
      [
        { name: 'slidrz', bytes: loadFixture('slidrz') },
        { name: 'tmio', bytes: loadFixture('tmio') },
      ],
      null,
      inflateNode,
    )
    expect(JSON.stringify(report).toLowerCase()).not.toContain('cheat')
    expect(formatReport(report).toLowerCase()).not.toContain('cheat')
  })

  test('ghost without inputs reports input signals as not applicable', async () => {
    const report = await analyzeBytes(
      [{ name: 'min', bytes: minimalGhostGbx() }],
      null,
      inflateNode,
    )
    const f = report.files[0]!
    for (const id of [
      'same_tick_toggle',
      'steer_spikes_per_sec',
      'input_density',
      'steer_repetition',
      'ticks_vs_racetime',
    ]) {
      const s = f.signals.find((x) => x.id === id)!
      expect(s.applicable, id).toBe(false)
      expect(s.fired, id).toBe(false)
    }
    expect(f.summary.needsHumanReview).toBe(false)
  })

  test('a file that fails to parse becomes an error report, the rest still analyze', async () => {
    const report = await analyzeBytes(
      [
        { name: 'bad', bytes: new Uint8Array([1, 2, 3]) },
        { name: 'tmio', bytes: loadFixture('tmio') },
      ],
      null,
      inflateNode,
    )
    expect(report.files.map((f) => f.name)).toEqual(['bad', 'tmio'])
    expect(report.files[0]!.signals[0]!.evidence.join(' ')).toMatch(/not a Gbx file/)
    expect(report.files[1]!.raceTimeMs).toBeGreaterThan(0)
  })
})

describe('cli analyze', () => {
  test('--json exits 0 and prints a report for several files', () => {
    const out = execFileSync(
      'node',
      ['src/cli/main.ts', 'analyze', fixturePath('slidrz'), fixturePath('tmio'), '--json'],
      { encoding: 'utf8' },
    )
    const report = JSON.parse(out)
    expect(report.files).toHaveLength(2)
    expect(report.groups).toEqual({ byMap: [], byLogin: [] })
  })

  test('text mode prints a row per signal', () => {
    const out = execFileSync('node', ['src/cli/main.ts', 'analyze', fixturePath('slidrz')], {
      encoding: 'utf8',
    })
    expect(out).toContain('wall_time_ratio')
    expect(out).toContain('needs human review')
  })

  test('a directory argument analyzes every gbx file in it', () => {
    const out = execFileSync('node', ['src/cli/main.ts', 'analyze', 'fixtures', '--json'], {
      encoding: 'utf8',
    })
    expect(JSON.parse(out).files.length).toBe(5)
  })
})

describe('file report identity', () => {
  test('carries the nickname next to the login', async () => {
    const report = await analyzeBytes(
      [{ name: 'slidrz', bytes: loadFixture('slidrz') }],
      null,
      inflateNode,
    )
    expect(report.files[0]!.nickname).toBe('Slidrz')
  })
})
