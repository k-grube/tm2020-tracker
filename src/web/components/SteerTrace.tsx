import { useState, type PointerEvent } from 'react'

const STEP_TICKS = 10
const WIDTH = 800
const HEIGHT = 120

// one point per 10 ticks, value -127..127 mapped to bottom..top
export function steerPath(steer: Int8Array, width: number, height: number): string {
  if (steer.length === 0) {
    return ''
  }
  const parts: string[] = []
  const span = Math.max(steer.length - 1, 1)
  for (let i = 0; i < steer.length; i += STEP_TICKS) {
    const x = (i / span) * width
    const y = height / 2 - (steer[i]! / 127) * (height / 2)
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`)
  }
  return parts.join(' ')
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function SteerTrace({ steer }: { steer: Int8Array }) {
  const [hover, setHover] = useState<number | null>(null)
  const span = Math.max(steer.length - 1, 1)
  const d = steerPath(steer, WIDTH, HEIGHT)
  const hx = hover === null ? 0 : (hover / span) * WIDTH

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tick = Math.round(((e.clientX - rect.left) / rect.width) * span)
    setHover(Math.min(Math.max(tick, 0), steer.length - 1))
  }

  return (
    <figure className="chart">
      <figcaption>steer, -127 to 127 over {(steer.length / 100).toFixed(2)} s</figcaption>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="steer-trace"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="steer value over time"
      >
        <line className="grid" x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
        <line className="grid" x1={0} x2={WIDTH} y1={0.5} y2={0.5} />
        <line className="grid" x1={0} x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
        <path className="series" d={d} />
        {hover !== null && (
          <g className="crosshair">
            <line x1={hx} x2={hx} y1={0} y2={HEIGHT} />
            <text
              x={hx < WIDTH / 2 ? hx + 6 : hx - 6}
              y={14}
              textAnchor={hx < WIDTH / 2 ? 'start' : 'end'}
            >
              {(hover / 100).toFixed(2)} s, steer {steer[hover]}
            </text>
          </g>
        )}
      </svg>
    </figure>
  )
}
