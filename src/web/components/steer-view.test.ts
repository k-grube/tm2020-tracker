import { describe, expect, test } from 'vitest'
import { steerPath, zoomView, type View } from './steer-view.ts'

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
