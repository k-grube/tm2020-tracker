import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dumpFile } from './dump.ts'
import { FIXTURES, fixturePath, loadFixture, type FixtureName } from '../test/fixtures.ts'

describe('dumpFile', () => {
  test('slidrz dump has race time, inputs, samples and chunk list', async () => {
    const d = await dumpFile(loadFixture('slidrz'), { events: 5 })
    expect(d.kind).toBe('ghost')
    expect(d.ghosts[0]!.raceTimeMs).toBe(24794)
    expect(d.inputs[0]!.firstEvents).toHaveLength(5)
    expect(d.inputs[0]!.eventCount).toBeGreaterThan(100)
    expect(d.samples!.count).toBeGreaterThan(200)
    expect(d.unknownChunks.every((id) => /^0x[0-9a-f]{8}$/.test(id))).toBe(true)
    expect(d.ghosts[0]!.inputs[0]!.data.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  test('cli dump --json exits 0 and prints JSON', () => {
    const out = execFileSync('node', ['src/cli/main.ts', 'dump', fixturePath('tmio'), '--json'], {
      encoding: 'utf8',
    })
    const parsed = JSON.parse(out)
    expect(parsed.kind).toBe('ghost')
  })

  test('cli dump text mode mentions race time', () => {
    const out = execFileSync('node', ['src/cli/main.ts', 'dump', fixturePath('slidrz')], {
      encoding: 'utf8',
    })
    expect(out).toContain('24794')
  })

  test.each(Object.keys(FIXTURES) as FixtureName[])('golden dump matches for %s', async (name) => {
    const goldenPath = fixturePath(name).replace(/\.(Ghost|Replay)\.[Gg]bx$/, '.dump.json')
    expect(existsSync(goldenPath), `missing golden ${goldenPath}`).toBe(true)
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'))
    const d = await dumpFile(loadFixture(name), { events: 20 })
    expect(JSON.parse(JSON.stringify(d))).toEqual(golden)
  })
})
