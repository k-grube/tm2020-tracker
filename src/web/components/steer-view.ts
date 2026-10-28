// visible tick range of the steer trace, start inclusive, end exclusive
export type View = [number, number]

export const MIN_VIEW_TICKS = 50

// scale the span by factor around the anchor (0 = left edge, 1 = right edge), clamped to the series
export function zoomView(view: View, factor: number, anchorFrac: number, length: number): View {
  const [start, end] = view
  const span = end - start
  const next = Math.min(length, Math.max(MIN_VIEW_TICKS, Math.round(span * factor)))
  const anchor = start + span * anchorFrac
  let nextStart = Math.round(anchor - next * anchorFrac)
  nextStart = Math.max(0, Math.min(length - next, nextStart))
  return [nextStart, nextStart + next]
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

// svg path for the visible range, one point per 10 ticks at full view, every tick when zoomed in
export function steerPath(steer: Int8Array, width: number, height: number, view?: View): string {
  if (steer.length === 0) {
    return ''
  }
  const [start, end] = view ?? [0, steer.length]
  const span = Math.max(end - start, 1)
  const step = Math.max(1, Math.min(10, Math.floor(span / 100)))
  const last = Math.min(end, steer.length - 1)
  const parts: string[] = []
  for (let i = start; i <= last; i += step) {
    const x = ((i - start) / span) * width
    const y = height / 2 - (steer[i]! / 127) * (height / 2)
    parts.push(`${parts.length === 0 ? 'M' : 'L'}${fmt(x)},${fmt(y)}`)
  }
  return parts.join(' ')
}

// shift the window by delta ticks, clamped to the series
export function panView(view: View, delta: number, length: number): View {
  const [start, end] = view
  const span = end - start
  const nextStart = Math.max(0, Math.min(length - span, Math.round(start + delta)))
  return [nextStart, nextStart + span]
}

export const MIN_THUMB_PX = 8

// scrollbar thumb for the view on a track of the given width
export function thumb(view: View, length: number, width: number): { x: number; width: number } {
  const [start, end] = view
  const w = Math.max(MIN_THUMB_PX, ((end - start) / length) * width)
  const x = Math.min(width - w, (start / length) * width)
  return { x, width: w }
}
