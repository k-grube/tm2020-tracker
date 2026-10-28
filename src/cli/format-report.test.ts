import { describe, expect, test } from 'vitest'
import { errorReport } from '../core/signals/index.ts'
import {
  SIGNAL_IDS,
  type FileReport,
  type Report,
  type SignalResult,
} from '../core/signals/types.ts'
import { formatSummary } from './format-report.ts'

function fileReport(
  name: string,
  overrides: Partial<Record<SignalResult['id'], Partial<SignalResult>>> = {},
  summary: Partial<FileReport['summary']> = {},
): FileReport {
  return {
    name,
    login: 'l',
    nickname: 'n',
    mapUid: 'm',
    raceTimeMs: 1000,
    device: 'pad',
    signals: SIGNAL_IDS.map((id) => ({
      id,
      level: id === 'ticks_vs_racetime' ? 'absolute' : 'relative',
      applicable: id !== 'trajectory_overlap',
      fired: false,
      value: null,
      unit: '',
      evidence: [],
      references: [],
      ...overrides[id],
    })),
    summary: {
      absoluteFired: [],
      empiricalFired: [],
      relativeOutside: [],
      needsHumanReview: false,
      ...summary,
    },
  }
}

function reportWith(files: FileReport[]): Report {
  return {
    generatedAt: 'now',
    files,
    groups: {
      byMap: [
        {
          mapUid: 'm',
          files: files.map((f) => f.name),
          signals: [
            {
              id: 'trajectory_overlap',
              level: 'relative',
              applicable: true,
              fired: false,
              value: 0,
              unit: 'ms',
              evidence: [],
              references: [],
              pair: ['a.Ghost.Gbx', 'b.Ghost.Gbx'],
            },
          ],
        },
      ],
      byLogin: [],
    },
  }
}

describe('formatSummary', () => {
  test('counts fired per signal and lists the files', () => {
    const report = reportWith([
      fileReport('a.Ghost.Gbx', { ticks_vs_racetime: { fired: false } }),
      fileReport('b.Ghost.Gbx', { ticks_vs_racetime: { fired: true } }, { needsHumanReview: true }),
      errorReport('c.bin', 'not a Gbx file', false),
    ])
    const out = formatSummary(report)
    expect(out).toContain('files 3, errors 1, review 1')
    expect(out).toMatch(/ticks_vs_racetime absolute 1\/2\n {2}b\.Ghost\.Gbx/)
    expect(out).toMatch(/trajectory_overlap pairs 0\/1/)
    expect(out).toMatch(/review\n {2}b\.Ghost\.Gbx/)
    expect(out).toMatch(/errors\n {2}c\.bin: not a Gbx file/)
  })
})
