import type { InputEvent, InputKind } from '../../core/model.ts'

export interface Lane {
  kind: InputKind
  segments: [number, number][]
}

// fixed lane order, also the categorical color order
const LANE_KINDS: InputKind[] = [
  'gas',
  'brake',
  'actionSlot',
  'horn',
  'jump',
  'freeLook',
  'respawn',
  'secondaryRespawn',
]
const ONE_WAY: InputKind[] = ['respawn', 'secondaryRespawn']

// held intervals per binary input, a press still held at the end closes at ticks
export function inputLanes(events: InputEvent[], ticks: number): Lane[] {
  const lanes: Lane[] = []
  for (const kind of LANE_KINDS) {
    const segments: [number, number][] = []
    let open: number | null = null
    for (const e of events) {
      if (e.kind !== kind) {
        continue
      }
      if (ONE_WAY.includes(kind)) {
        segments.push([e.tick, e.tick + 1])
        continue
      }
      const pressed = kind === 'actionSlot' ? e.value2 === 1 : e.value === 1
      if (pressed && open === null) {
        open = e.tick
      } else if (!pressed && open !== null) {
        segments.push([open, Math.max(e.tick, open + 1)])
        open = null
      }
    }
    if (open !== null) {
      segments.push([open, ticks])
    }
    if (segments.length > 0) {
      lanes.push({ kind, segments })
    }
  }
  return lanes
}

const WIDTH = 800
const LANE_H = 18
const LABEL_W = 110

export function InputTimeline({ events, ticks }: { events: InputEvent[]; ticks: number }) {
  const lanes = inputLanes(events, ticks)
  if (lanes.length === 0 || ticks === 0) {
    return null
  }
  const plotW = WIDTH - LABEL_W
  const height = lanes.length * LANE_H
  return (
    <figure className="chart">
      <figcaption>inputs held over {(ticks / 100).toFixed(2)} s</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="input-timeline"
        role="img"
        aria-label="input timeline"
      >
        {lanes.map((lane, i) => (
          <g key={lane.kind} transform={`translate(0,${i * LANE_H})`}>
            <text x={LABEL_W - 8} y={LANE_H / 2 + 4} textAnchor="end" className="lane-label">
              {lane.kind}
            </text>
            <line className="grid" x1={LABEL_W} x2={WIDTH} y1={LANE_H - 0.5} y2={LANE_H - 0.5} />
            {lane.segments.map(([a, b]) => (
              <rect
                key={a}
                className={`lane-${LANE_KINDS.indexOf(lane.kind) + 1}`}
                x={LABEL_W + (a / ticks) * plotW}
                y={3}
                width={Math.max(((b - a) / ticks) * plotW, 1)}
                height={LANE_H - 6}
                rx={2}
              >
                <title>{`${lane.kind} ${(a / 100).toFixed(2)} s to ${(b / 100).toFixed(2)} s`}</title>
              </rect>
            ))}
          </g>
        ))}
      </svg>
    </figure>
  )
}
