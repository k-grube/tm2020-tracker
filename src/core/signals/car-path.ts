import { CAR_PATH_MIN_MS, CAR_PATH_MIN_SAMPLES } from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector } from './types.ts'

// distance the positions cover inside the race per race second. legit records never read
// below 49 m/s, a car parked at the start while the finish fires reads 0
export const carPath: Detector = (ctx) => {
  const samples = ctx.samples
  const race = ctx.ghost.raceTimeMs
  if (!samples) {
    return notApplicable('car_path', 'empirical', 'needs position samples')
  }
  if (race === null || race <= 0) {
    return notApplicable('car_path', 'empirical', 'no race time')
  }
  const inRace = samples.filter((s) => s.timeMs >= 0 && s.timeMs <= race)
  if (inRace.length < CAR_PATH_MIN_SAMPLES) {
    return notApplicable('car_path', 'empirical', `${inRace.length} samples in the race`)
  }
  let path = 0
  for (let i = 1; i < inRace.length; i++) {
    const a = inRace[i - 1]!.position
    const b = inRace[i]!.position
    path += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  }
  const perSec = path / (race / 1000)
  return {
    id: 'car_path',
    level: 'empirical',
    applicable: true,
    fired: perSec < CAR_PATH_MIN_MS,
    value: perSec,
    unit: 'm/s',
    evidence: [
      `path ${path.toFixed(0)} m over ${(race / 1000).toFixed(3)} s, ${perSec.toFixed(1)} m/s`,
    ],
    references: [],
  }
}
