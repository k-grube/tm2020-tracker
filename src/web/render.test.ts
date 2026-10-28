import { describe, expect, test } from 'vitest'
import { SIGNAL_IDS } from '../core/signals/types.ts'
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
      expect(html).toContain('steer 0.00 s to ')
      expect(html).toMatch(/<caption[^>]*>checkpoints<\/caption>/)
      expect((html.match(/<path class="series" d="M/g) ?? []).length).toBe(1)
    },
  )

  test('renders the pair signals for two files on one map', async () => {
    const files = (['localReplay', 'localPbReplay'] as const).map((n) => ({
      name: n,
      bytes: loadFixture(n),
    }))
    const report = await analyzeBytes(files, null, inflateWeb)
    const html = renderToStaticMarkup(
      createElement(GroupsView, { groups: report.groups, files: report.files }),
    )
    expect(html).toContain('across files')
    expect(html).toContain('2 files, 1 pair, 0 flagged')
    expect(html).not.toContain('trajectory_overlap: localReplay')
    expect(html).toContain('login KrE23CqvT8-wmr21pF5rqQ')
  })

  test('lists only the flagged pairs, by nickname', async () => {
    const pair = (a: string, b: string, fired: boolean) => ({
      id: 'trajectory_overlap' as const,
      level: 'relative' as const,
      applicable: true,
      fired,
      value: fired ? 5200 : 0,
      unit: 'ms',
      evidence: [`longest overlap ${fired ? 5200 : 0} ms from 4000 ms, within 0.1 m`],
      references: [],
      pair: [a, b] as [string, string],
    })
    const files = ['a.Gbx', 'b.Gbx', 'c.Gbx'].map((name, i) => ({
      name,
      login: `l${i}`,
      nickname: ['Ann', 'Bob', 'Cid'][i]!,
      mapUid: 'm',
      raceTimeMs: 1000,
      device: 'pad' as const,
      signals: [],
      summary: { absoluteFired: [], relativeOutside: [], needsHumanReview: false },
    }))
    const groups = {
      byMap: [
        {
          mapUid: 'm',
          files: files.map((f) => f.name),
          signals: [
            pair('a.Gbx', 'b.Gbx', false),
            pair('a.Gbx', 'c.Gbx', true),
            pair('b.Gbx', 'c.Gbx', false),
          ],
        },
      ],
      byLogin: [],
    }
    const html = renderToStaticMarkup(createElement(GroupsView, { groups, files }))
    expect(html).toContain('3 files, 3 pairs, 1 flagged')
    expect((html.match(/<li/g) ?? []).length).toBe(1)
    expect(html).toContain('Ann vs Cid')
    expect(html).not.toContain('a.Gbx vs')
  })
})

describe('SteerTrace spans', () => {
  test('flagged spans render as bars at the top with their label', async () => {
    const { SteerTrace } = await import('./components/SteerTrace.tsx')
    const html = renderToStaticMarkup(
      createElement(SteerTrace, {
        steer: new Int8Array(1000),
        spans: [
          { startTick: 100, endTick: 200, label: 'gas toggle' },
          { startTick: 500, endTick: 600, label: 'repeat 100 ticks' },
        ],
      }),
    )
    expect((html.match(/class="flag"/g) ?? []).length).toBe(2)
    expect(html).toContain('<title>gas toggle</title>')
  })
})

describe('SteerTrace scrollbar', () => {
  test('the full view has no scrollbar', async () => {
    const { SteerTrace } = await import('./components/SteerTrace.tsx')
    const html = renderToStaticMarkup(createElement(SteerTrace, { steer: new Int8Array(1000) }))
    expect(html).not.toContain('role="scrollbar"')
  })
})

describe('RecordTable', () => {
  test('renders one row per record with an analyze button', async () => {
    const { RecordTable } = await import('./components/CampaignBrowser.tsx')
    const html = renderToStaticMarkup(
      createElement(RecordTable, {
        records: [
          {
            position: 1,
            player: 'KarjeN',
            playerId: 'p',
            timeMs: 19988,
            timestamp: '2026-10-21T16:48:15+00:00',
            ghostId: 'g1',
          },
          {
            position: 2,
            player: 'hobbi.',
            playerId: 'q',
            timeMs: 20001,
            timestamp: '2026-10-22T10:00:00+00:00',
            ghostId: 'g2',
          },
        ],
        busy: false,
        onAnalyze: () => {},
      }),
    )
    expect((html.match(/<tr/g) ?? []).length).toBe(3)
    expect(html).toContain('KarjeN')
    expect(html).toContain('19.988')
    expect((html.match(/>analyze</g) ?? []).length).toBe(2)
  })
})

describe('TrackBar', () => {
  test('stretches the 800 unit track over the full width and places the thumb', async () => {
    const { TrackBar } = await import('./components/SteerTrace.tsx')
    const html = renderToStaticMarkup(
      createElement(TrackBar, {
        view: [620, 1860],
        length: 2480,
        onPointerDown: () => {},
        onPointerMove: () => {},
        onPointerUp: () => {},
      }),
    )
    expect(html).toContain('preserveAspectRatio="none"')
    expect(html).toContain('role="scrollbar"')
    expect(html).toMatch(/class="thumb" x="200" y="0" width="400"/)
  })
})

describe('FileTabs', () => {
  test('one tab per file, the selected one marked, review dot on flagged files', async () => {
    const { FileTabs } = await import('./components/FileTabs.tsx')
    const html = renderToStaticMarkup(
      createElement(FileTabs, {
        entries: [
          { name: 'a.Ghost.Gbx', nickname: 'Slidrz', raceTimeMs: 24794, status: 'ok' as const },
          { name: 'b.Ghost.Gbx', nickname: 'hobbi.', raceTimeMs: 59323, status: 'review' as const },
          { name: 'c.Ghost.Gbx', nickname: 'geppty', raceTimeMs: 49292, status: 'warn' as const },
        ],
        selected: 1,
        sort: 'name' as const,
        onSort: () => {},
        onSelect: () => {},
        onRemove: () => {},
        onClear: () => {},
      }),
    )
    expect((html.match(/role="tab"/g) ?? []).length).toBe(3)
    expect(html).toContain('Slidrz 24.794')
    expect(html).toContain('hobbi. 59.323')
    expect((html.match(/aria-selected="true"/g) ?? []).length).toBe(1)
    expect((html.match(/class="[^"]*bg-red-600[^"]*"/g) ?? []).length).toBe(1)
    expect((html.match(/class="[^"]*bg-green-600[^"]*"/g) ?? []).length).toBe(1)
    expect((html.match(/class="[^"]*bg-amber-500[^"]*"/g) ?? []).length).toBe(1)
    expect(html).toContain('clear all')
  })
})

describe('FileTabs order', () => {
  test('tabs sort by label, case-insensitive, callbacks keep the original index', async () => {
    const { FileTabs } = await import('./components/FileTabs.tsx')
    const html = renderToStaticMarkup(
      createElement(FileTabs, {
        entries: [
          { name: 'z.Ghost.Gbx', nickname: 'Zed', raceTimeMs: 1000, status: 'ok' as const },
          { name: 'a.Ghost.Gbx', nickname: 'alpha', raceTimeMs: 1000, status: 'ok' as const },
          { name: 'm.Ghost.Gbx', nickname: 'Mid', raceTimeMs: 1000, status: 'ok' as const },
        ],
        selected: 0,
        sort: 'name' as const,
        onSort: () => {},
        onSelect: () => {},
        onRemove: () => {},
        onClear: () => {},
      }),
    )
    const labels = [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1])
    expect(labels).toEqual(['alpha 1.000', 'Mid 1.000', 'Zed 1.000'])
    expect(html).toMatch(/aria-selected="true"[^>]*>Zed 1\.000</)
  })
})

describe('Glossary', () => {
  test('has an entry for every signal id', async () => {
    const { Glossary } = await import('./components/Glossary.tsx')
    const html = renderToStaticMarkup(createElement(Glossary))
    for (const id of SIGNAL_IDS) {
      expect(html, id).toContain(`<dt`)
      expect(html, id).toContain(`>${id}<`)
    }
    expect(html).toContain('<details')
  })
})

describe('MapRecords', () => {
  test('button is disabled until the field holds a tmx map id', async () => {
    const { MapRecords } = await import('./components/MapRecords.tsx')
    const empty = renderToStaticMarkup(
      createElement(MapRecords, { proxy: 'https://p', busy: false, onFiles: () => {} }),
    )
    expect(empty).toContain('analyze top 25')
    expect(empty).toMatch(/<button[^>]*disabled/)
  })
})

describe('FileTabs sort', () => {
  const entries = [
    { name: 'z.Ghost.Gbx', nickname: 'Zed', raceTimeMs: 1500, status: 'ok' as const },
    { name: 'a.Ghost.Gbx', nickname: 'alpha', raceTimeMs: 3000, status: 'ok' as const },
    { name: 'm.Ghost.Gbx', nickname: 'Mid', raceTimeMs: 1000, status: 'ok' as const },
    { name: 'broken.Gbx', nickname: '', raceTimeMs: null, status: 'error' as const },
  ]
  const labels = (html: string) => [...html.matchAll(/role="tab"[^>]*>([^<]+)</g)].map((m) => m[1])

  test('time puts the fastest first and files without a time last', async () => {
    const { FileTabs } = await import('./components/FileTabs.tsx')
    const html = renderToStaticMarkup(
      createElement(FileTabs, {
        entries,
        selected: 0,
        sort: 'time',
        onSort: () => {},
        onSelect: () => {},
        onRemove: () => {},
        onClear: () => {},
      }),
    )
    expect(labels(html)).toEqual(['Mid 1.000', 'Zed 1.500', 'alpha 3.000', 'broken.Gbx'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>time</)
  })

  test('sort buttons only show with two or more files', async () => {
    const { FileTabs } = await import('./components/FileTabs.tsx')
    const props = {
      selected: 0,
      sort: 'name' as const,
      onSort: () => {},
      onSelect: () => {},
      onRemove: () => {},
      onClear: () => {},
    }
    expect(
      renderToStaticMarkup(createElement(FileTabs, { ...props, entries: entries.slice(0, 1) })),
    ).not.toContain('aria-pressed')
    expect(renderToStaticMarkup(createElement(FileTabs, { ...props, entries }))).toContain(
      'aria-pressed',
    )
  })
})
