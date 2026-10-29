import { describe, expect, test } from 'vitest'
import { carPath } from './car-path.ts'
import { fakeCtx, fakeSamples } from './test-util.ts'

describe('car_path', () => {
  test('a car that never leaves the start fires', () => {
    const positions = Array.from(
      { length: 963 },
      () => [336, 72.5, 272] as [number, number, number],
    )
    const r = carPath(
      fakeCtx({ ghost: { raceTimeMs: 48142 }, samples: fakeSamples(positions, 50) }),
      null,
    )
    expect(r.fired).toBe(true)
    expect(r.value).toBe(0)
    expect(r.evidence).toEqual(['path 0 m over 48.142 s, 0.0 m/s'])
  })

  test('a drive at 50 m/s is quiet', () => {
    const positions = Array.from(
      { length: 101 },
      (_, i) => [i * 2.5, 0, 0] as [number, number, number],
    )
    const r = carPath(
      fakeCtx({ ghost: { raceTimeMs: 5000 }, samples: fakeSamples(positions, 50) }),
      null,
    )
    expect(r.fired).toBe(false)
    expect(r.value).toBe(50)
    expect(r.evidence).toEqual(['path 250 m over 5.000 s, 50.0 m/s'])
  })

  test('a drive at 15 m/s fires', () => {
    const positions = Array.from(
      { length: 101 },
      (_, i) => [i * 0.75, 0, 0] as [number, number, number],
    )
    const r = carPath(
      fakeCtx({ ghost: { raceTimeMs: 5000 }, samples: fakeSamples(positions, 50) }),
      null,
    )
    expect(r.fired).toBe(true)
    expect(r.evidence).toEqual(['path 75 m over 5.000 s, 15.0 m/s'])
  })

  test('samples after the finish do not count', () => {
    const positions = Array.from(
      { length: 201 },
      (_, i) => [i * 2.5, 0, 0] as [number, number, number],
    )
    const r = carPath(
      fakeCtx({ ghost: { raceTimeMs: 5000 }, samples: fakeSamples(positions, 50) }),
      null,
    )
    expect(r.evidence).toEqual(['path 250 m over 5.000 s, 50.0 m/s'])
  })

  test('not applicable with few samples or no race time', () => {
    const positions = Array.from({ length: 10 }, () => [0, 0, 0] as [number, number, number])
    expect(
      carPath(fakeCtx({ ghost: { raceTimeMs: 5000 }, samples: fakeSamples(positions, 50) }), null)
        .applicable,
    ).toBe(false)
    expect(
      carPath(fakeCtx({ ghost: { raceTimeMs: null }, samples: fakeSamples(positions, 50) }), null)
        .applicable,
    ).toBe(false)
    expect(carPath(fakeCtx({ samples: null }), null).applicable).toBe(false)
  })
})
