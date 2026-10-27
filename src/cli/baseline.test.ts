import { describe, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { baselineCommand } from './baseline.ts'

describe('baselineCommand', () => {
  test('on the fixtures dir records chunk presence and file count', async () => {
    const b = await baselineCommand('fixtures', { ranks: [10, 50] })
    expect(b.files).toBe(5)
    expect(b.ranks).toEqual([10, 50])
    expect(b.chunkPresence['0x0309201d']).toBe(1)
    expect(b.chunkPresence['0x0309202c']).toBe(1)
    expect(b.chunkPresence['0x0309202d']).toBe(1)
    expect(b.chunkPresence['0x03092023']).toBe(1)
  })

  test('filters by leaderboard position from index.json', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm2020-baseline-'))
    for (const f of ['a.Ghost.Gbx', 'b.Ghost.Gbx']) {
      writeFileSync(
        join(dir, f),
        readFileSync('fixtures/Slidrz_(00_24_794)_symmetrical-spring-2025-03.Ghost.Gbx'),
      )
    }
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({
        'a.Ghost.Gbx': { recordId: 'a', replayId: null, position: 1, mapId: 1, recordTimeMs: 1 },
        'b.Ghost.Gbx': { recordId: 'b', replayId: null, position: 20, mapId: 1, recordTimeMs: 1 },
      }),
    )
    const b = await baselineCommand(dir, { ranks: [10, 50] })
    expect(b.files).toBe(1)
  })

  test('cli writes the baseline file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tm2020-baseline-out-'))
    const out = join(dir, 'baseline.json')
    execFileSync('node', ['src/cli/main.ts', 'baseline', 'fixtures', '--out', out], {
      encoding: 'utf8',
    })
    const b = JSON.parse(readFileSync(out, 'utf8'))
    expect(b.files).toBe(5)
    expect(b.signals).toBeDefined()
  })
})
