import { describe, expect, test } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { analyzeBytes } from '../core/pipeline.ts'
import { inflateWeb } from './inflate.ts'
import { fileViz } from './viz.ts'
import { fmtMs, fmtValue } from './format.ts'
import { FileReportView } from './components/FileReportView.tsx'
import { GroupsView } from './components/GroupsView.tsx'
import { FIXTURES, loadFixture, type FixtureName } from '../test/fixtures.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

describe('fileViz', () => {
  test.each(Object.keys(FIXTURES) as FixtureName[])('steer covers every tick for %s', (name) => {
    const viz = fileViz(loadFixture(name))
    expect(viz).not.toBeNull()
    expect(viz!.steer!.length).toBe(viz!.ticks)
    expect(viz!.events.length).toBeGreaterThan(100)
    expect(viz!.checkpoints.length).toBeGreaterThan(0)
  })

  test('is null for bytes that do not parse', () => {
    expect(fileViz(new Uint8Array([1, 2, 3]))).toBeNull()
  })
})

describe('FileReportView', () => {
  test.each(Object.keys(FIXTURES) as FixtureName[])(
    'renders every signal value from the report for %s',
    async (name) => {
      const bytes = loadFixture(name)
      const report = await analyzeBytes([{ name, bytes }], null, inflateWeb)
      const file = report.files[0]!
      const html = renderToStaticMarkup(
        createElement(FileReportView, { report: file, viz: fileViz(bytes) }),
      )
      expect(html).toContain('needs human review: no')
      expect(html).toContain(`race ${fmtMs(file.raceTimeMs!)}`)
      for (const s of file.signals) {
        expect(html).toContain(esc(fmtValue(s)))
        expect(html).toContain(esc(s.evidence[0]!))
      }
      expect(html).toContain('<figcaption>steer</figcaption>')
      expect(html).toContain('<caption>checkpoints</caption>')
      expect((html.match(/<path class="series" d="M/g) ?? []).length).toBe(1)
    },
  )

  test('renders the pair signals for two files on one map', async () => {
    const files = (['localReplay', 'localPbReplay'] as const).map((n) => ({
      name: n,
      bytes: loadFixture(n),
    }))
    const report = await analyzeBytes(files, null, inflateWeb)
    const html = renderToStaticMarkup(createElement(GroupsView, { groups: report.groups }))
    expect(html).toContain('across files')
    expect(html).toContain('trajectory_overlap: localReplay vs localPbReplay')
    expect(html).toContain('login KrE23CqvT8-wmr21pF5rqQ')
  })
})
