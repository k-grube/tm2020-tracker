import { describe, expect, test } from 'vitest'
import { panView, steerPath, thumb, zoomView, type View } from './steer-view.ts'

describe('zoomView', () => {
  const full: View = [0, 2480]

  test('zooming in halves the span around the anchor and clamps to the series', () => {
    expect(zoomView(full, 0.5, 0.5, 2480)).toEqual([620, 1860])
    expect(zoomView(full, 0.5, 0, 2480)).toEqual([0, 1240])
    expect(zoomView(full, 0.5, 1, 2480)).toEqual([1240, 2480])
  })

  test('zooming out never leaves the series and stops at the full range', () => {
    expect(zoomView([620, 1860], 2, 0.5, 2480)).toEqual([0, 2480])
    expect(zoomView([0, 1240], 2, 0.5, 2480)).toEqual([0, 2480])
  })

  test('the span never drops below 50 ticks', () => {
    expect(zoomView([1000, 1060], 0.5, 0.5, 2480)).toEqual([1005, 1055])
    expect(zoomView([1005, 1055], 0.5, 0.5, 2480)).toEqual([1005, 1055])
  })
})

describe('steerPath with a view', () => {
  test('a zoomed view fills the width and uses finer steps', () => {
    const steer = new Int8Array(1000)
    steer.fill(127, 550)
    const d = steerPath(steer, 400, 100, [500, 600])
    expect(d.startsWith('M0,50')).toBe(true)
    expect(d.match(/L/g)).toHaveLength(100)
    expect(d.endsWith('L400,0')).toBe(true)
  })

  test('the default view keeps one point per 10 ticks', () => {
    expect(steerPath(new Int8Array(1000), 400, 100).match(/L/g)).toHaveLength(99)
  })
})

describe('panView', () => {
  test('shifts the window by ticks and clamps at both ends', () => {
    expect(panView([620, 1860], 100, 2480)).toEqual([720, 1960])
    expect(panView([620, 1860], -1000, 2480)).toEqual([0, 1240])
    expect(panView([620, 1860], 5000, 2480)).toEqual([1240, 2480])
  })

  test('a full view does not move', () => {
    expect(panView([0, 2480], 300, 2480)).toEqual([0, 2480])
  })
})

describe('thumb', () => {
  test('maps the view onto a track of the given width', () => {
    expect(thumb([620, 1860], 2480, 800)).toEqual({ x: 200, width: 400 })
    expect(thumb([0, 2480], 2480, 800)).toEqual({ x: 0, width: 800 })
  })

  test('never gets thinner than 8 px', () => {
    expect(thumb([1000, 1010], 2480, 800).width).toBe(8)
  })
})

describe('steerPath while panning', () => {
  test('samples stay on a fixed tick grid so a one tick pan does not reshape the line', () => {
    const steer = Int8Array.from(Array.from({ length: 2000 }, (_, i) => ((i * 37) % 255) - 127))
    const ys = (d: string) => d.match(/,(-?[\d.]+)/g)
    const a = ys(steerPath(steer, 400, 100, [0, 1000]))!
    const b = ys(steerPath(steer, 400, 100, [3, 1003]))!
    expect(b.slice(0, a.length)).toEqual(a)
  })
})
