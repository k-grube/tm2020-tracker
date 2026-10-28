import { binarySeries } from '../inputs/decode.ts'
import {
  ACTION_KEY_FACTORS,
  SAMPLE_INPUT_MAX_MISMATCH,
  SAMPLE_INPUT_MIN_SAMPLES,
  SAMPLE_STEER_TOLERANCE,
  TICK_MS,
} from './constants.ts'
import { notApplicable } from './relative.ts'
import type { Detector, Span } from './types.ts'
import { raceWindow } from './window.ts'

const MIN_RUN = 5
const MAX_SPANS = 200
const pct = (share: number): string => `${(share * 100).toFixed(1)}%`
const near = (a: number, b: number): boolean => Math.abs(a - b) <= SAMPLE_STEER_TOLERANCE

// the applied steer equals the stick, or the stick under an action key: capped at k x 127 or
// scaled by k, same sign either way
function steerMatches(sample: number, input: number): boolean {
  if (sample === input) {
    return true
  }
  if (sample !== 0 && Math.sign(sample) !== Math.sign(input)) {
    return false
  }
  const s = Math.abs(sample)
  const i = Math.abs(input)
  return ACTION_KEY_FACTORS.some(
    (k) => (near(s, k * 127) && i >= s - SAMPLE_STEER_TOLERANCE) || near(s, i * k),
  )
}

// the vehicle samples carry the steer, gas and brake the engine applied; a sample agrees with the
// input stream at its own tick or the one before. keyboard steer is ramped by the game, pad only
export const sampleInputMatch: Detector = (ctx) => {
  const { samples, steer } = ctx
  const input = ctx.ghost.inputs[0]
  if (!samples || samples.length === 0 || !steer || !input) {
    return notApplicable('sample_input_match', 'empirical', 'needs samples and decoded inputs')
  }
  const win = raceWindow(ctx)
  if (!win) {
    return notApplicable('sample_input_match', 'empirical', 'no race window')
  }
  const offset = input.startOffsetMs ?? 0
  const gas = binarySeries(ctx.events, 'gas', steer.length)
  const brake = binarySeries(ctx.events, 'brake', steer.length)
  const effective = (t: number): boolean => gas[t] === 1 && brake[t] === 0
  const checkSteer = ctx.device === 'pad'
  let n = 0
  let gasBad = 0
  let steerBad = 0
  const spans: Span[] = []
  let run = 0
  let runStart = 0
  let lastTick = 0
  const closeRun = (): void => {
    if (run >= MIN_RUN && spans.length < MAX_SPANS) {
      spans.push({ startTick: runStart, endTick: lastTick + 1, label: 'sample mismatch' })
    }
    run = 0
  }
  for (const s of samples) {
    const tick = Math.round((s.timeMs - offset) / TICK_MS)
    if (tick < Math.max(2, win.startTick) || tick > win.endTick || tick >= steer.length) {
      continue
    }
    n++
    const gasOk = s.gas === effective(tick) || s.gas === effective(tick - 1)
    const steerOk =
      !checkSteer || steerMatches(s.steer, steer[tick]!) || steerMatches(s.steer, steer[tick - 1]!)
    if (!gasOk) {
      gasBad++
    }
    if (!steerOk) {
      steerBad++
    }
    if (gasOk && steerOk) {
      closeRun()
      continue
    }
    if (run === 0) {
      runStart = tick
    }
    run++
    lastTick = tick
  }
  closeRun()
  if (n < SAMPLE_INPUT_MIN_SAMPLES) {
    return notApplicable('sample_input_match', 'empirical', `${n} samples inside the race`)
  }
  const gasShare = gasBad / n
  const steerShare = checkSteer ? steerBad / n : 0
  const value = Math.max(gasShare, steerShare)
  return {
    id: 'sample_input_match',
    level: 'empirical',
    applicable: true,
    fired: value > SAMPLE_INPUT_MAX_MISMATCH,
    value,
    unit: 'share',
    evidence: [
      `gas mismatch ${pct(gasShare)} of ${n} samples`,
      checkSteer
        ? `steer mismatch ${pct(steerShare)} of ${n} samples`
        : `steer rule skipped, ${ctx.device}`,
    ],
    references: [],
    ...(spans.length > 0 ? { spans } : {}),
  }
}
