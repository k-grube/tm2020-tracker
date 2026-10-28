import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Span } from '../../core/signals/types.ts'
import { steerPath, zoomView, type View } from './steer-view.ts'

export { steerPath } from './steer-view.ts'

const WIDTH = 800
const HEIGHT = 120
const FLAG_H = 4
const ZOOM_IN = 0.5
const ZOOM_OUT = 2
const WHEEL_STEP = 1.25

const BTN =
  'rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'

export function SteerTrace({ steer, spans = [] }: { steer: Int8Array; spans?: Span[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [view, setView] = useState<View>([0, steer.length])
  const [hover, setHover] = useState<number | null>(null)
  const [start, end] = view
  const span = Math.max(end - start, 1)
  const toX = (tick: number) => ((tick - start) / span) * WIDTH
  const d = steerPath(steer, WIDTH, HEIGHT, view)

  // react registers wheel as passive, the page would scroll along with the zoom
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      const frac = (e.clientX - rect.left) / rect.width
      setView((v) => zoomView(v, e.deltaY < 0 ? 1 / WHEEL_STEP : WHEEL_STEP, frac, steer.length))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [steer.length])

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const tick = Math.round(start + ((e.clientX - rect.left) / rect.width) * span)
    setHover(Math.min(Math.max(tick, 0), steer.length - 1))
  }

  const hx = hover === null ? 0 : toX(hover)
  const visible = spans.filter((s) => s.endTick > start && s.startTick < end)

  return (
    <figure className="chart mt-5">
      <figcaption className="mb-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
        <span>
          steer {(start / 100).toFixed(2)} s to {(end / 100).toFixed(2)} s
        </span>
        <button
          type="button"
          className={BTN}
          onClick={() => setView((v) => zoomView(v, ZOOM_IN, 0.5, steer.length))}
        >
          +
        </button>
        <button
          type="button"
          className={BTN}
          onClick={() => setView((v) => zoomView(v, ZOOM_OUT, 0.5, steer.length))}
        >
          -
        </button>
        <button type="button" className={BTN} onClick={() => setView([0, steer.length])}>
          reset
        </button>
      </figcaption>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full touch-none rounded-md bg-zinc-50 dark:bg-zinc-900"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label="steer value over time"
      >
        <line className="gridline" x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} />
        <line className="gridline" x1={0} x2={WIDTH} y1={0.5} y2={0.5} />
        <line className="gridline" x1={0} x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} />
        <path className="series" d={d} />
        {visible.map((s, i) => {
          const x = toX(Math.max(s.startTick, start))
          const w = Math.max(toX(Math.min(s.endTick, end)) - x, 2)
          return (
            <rect key={i} className="flag" x={x} y={0} width={w} height={FLAG_H}>
              <title>{s.label}</title>
            </rect>
          )
        })}
        {hover !== null && (
          <g className="crosshair">
            <line x1={hx} x2={hx} y1={0} y2={HEIGHT} />
            <text
              x={hx < WIDTH / 2 ? hx + 6 : hx - 6}
              y={16}
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
