import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Span } from '../../core/signals/types.ts'
import { panView, steerPath, thumb, zoomView, type View } from './steer-view.ts'

export { steerPath } from './steer-view.ts'

const WIDTH = 800
const HEIGHT = 120
const FLAG_H = 4
const TRACK_H = 8
const ZOOM_IN = 0.5
const ZOOM_OUT = 2
const WHEEL_STEP = 1.25

const BTN =
  'rounded border border-zinc-300 px-2 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800'

// scrollbar under the plot, 800 units stretched over the full width so thumb and pointer agree
export function TrackBar({
  view,
  length,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  view: View
  length: number
  onPointerDown: (e: PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: PointerEvent<SVGSVGElement>) => void
}) {
  const th = thumb(view, length, WIDTH)
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${TRACK_H}`}
      preserveAspectRatio="none"
      className="mt-1 h-2 w-full touch-none cursor-pointer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="scrollbar"
      aria-valuemin={0}
      aria-valuemax={length}
      aria-valuenow={view[0]}
    >
      <rect className="track" x={0} y={0} width={WIDTH} height={TRACK_H} />
      <rect className="thumb" x={th.x} y={0} width={th.width} height={TRACK_H} />
    </svg>
  )
}

export function SteerTrace({ steer, spans = [] }: { steer: Int8Array; spans?: Span[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; view: View } | null>(null)
  const [view, setView] = useState<View>([0, steer.length])
  const [hover, setHover] = useState<number | null>(null)
  const [start, end] = view
  const span = Math.max(end - start, 1)
  const zoomed = span < steer.length
  const toX = (tick: number) => ((tick - start) / span) * WIDTH
  const d = steerPath(steer, WIDTH, HEIGHT, view)

  // react registers wheel as passive, the page would scroll along with the zoom
  // plain wheel zooms around the cursor, shift or a horizontal wheel pans
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) {
      return
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        const delta = e.shiftKey ? e.deltaY : e.deltaX
        setView((v) => panView(v, ((v[1] - v[0]) * delta) / rect.width, steer.length))
        return
      }
      const frac = (e.clientX - rect.left) / rect.width
      setView((v) => zoomView(v, e.deltaY < 0 ? 1 / WHEEL_STEP : WHEEL_STEP, frac, steer.length))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [steer.length])

  const ticksPerPx = (rectWidth: number) => span / rectWidth

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!zoomed) {
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, view }
    setHover(null)
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (drag.current) {
      const dx = e.clientX - drag.current.x
      setView(panView(drag.current.view, -dx * ticksPerPx(rect.width), steer.length))
      return
    }
    const tick = Math.round(start + ((e.clientX - rect.left) / rect.width) * span)
    setHover(Math.min(Math.max(tick, 0), steer.length - 1))
  }

  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      drag.current = null
    }
  }

  // the track below the plot, drag the thumb or click beside it to centre the view there
  const trackDrag = useRef<{ x: number; view: View } | null>(null)
  const onTrackDown = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const u = ((e.clientX - rect.left) / rect.width) * WIDTH
    const t = thumb(view, steer.length, WIDTH)
    let next = view
    if (u < t.x || u > t.x + t.width) {
      const centre = (u / WIDTH) * steer.length
      next = panView(view, centre - (start + span / 2), steer.length)
      setView(next)
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    trackDrag.current = { x: e.clientX, view: next }
  }
  const onTrackMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!trackDrag.current) {
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - trackDrag.current.x
    setView(panView(trackDrag.current.view, (dx / rect.width) * steer.length, steer.length))
  }
  const onTrackUp = (e: PointerEvent<SVGSVGElement>) => {
    if (trackDrag.current) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      trackDrag.current = null
    }
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
        className={`h-auto w-full touch-none rounded-md bg-zinc-50 dark:bg-zinc-900 ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
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
      {zoomed && (
        <TrackBar
          view={view}
          length={steer.length}
          onPointerDown={onTrackDown}
          onPointerMove={onTrackMove}
          onPointerUp={onTrackUp}
        />
      )}
    </figure>
  )
}
