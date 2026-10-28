// every tunable in one place, see docs/superpowers/specs/2026-10-27-replay-analyzer-design.md

// physics tick
export const TICK_MS = 10

// ticks_vs_racetime: tolerated gap between recorded input ticks and race time
export const TICKS_TOLERANCE = 2

// steer_spikes_per_sec: 2021 report ignored deltas under 2000 of 65536, same share of the 127 range
export const STEER_SPIKE_MIN_DELTA = 4
export const SPIKE_WINDOW_MS = 1000

// same_tick_toggle: press and release this many ticks apart or less
export const SAME_TICK_MAX_GAP_TICKS = 1
// 1220 legit top records max out at 4 one-tick toggles per run
export const SAME_TICK_MIN_COUNT = 10

// steer_repetition: shortest exact repeat worth reporting, and a held constant value is not a repeat
export const REPEAT_MIN_LEN_TICKS = 50
export const REPEAT_MIN_DISTINCT_VALUES = 3

// steer_device
export const KEYBOARD_STEER_VALUES = [-127, 0, 127]
export const PAD_MIN_DISTINCT_STEER = 16

// trajectory_overlap: same position within this distance, for at least this long, ignoring the start block
export const TRAJECTORY_EPS_M = 0.1
export const TRAJECTORY_MIN_WINDOW_MS = 2000
// countdown and launch straight overlap for every pair, 29590 legit pairs stop overlapping by 4 s
export const TRAJECTORY_SKIP_START_MS = 4000
// longest sample span two files are stepped through, file-declared times past this are not compared
export const TRAJECTORY_MAX_SPAN_MS = 2 * 60 * 60 * 1000

// wall time chunk stores unix seconds
export const WALL_TIME_RESOLUTION_S = 1

// relative signals fire outside q1 - k*IQR .. q3 + k*IQR of the baseline
export const TUKEY_K = 1.5

// published 2021 TMX investigation numbers (United leaderboard average)
export const REF_2021 = { avgSpikesPerSec: 3, avgMaxSpikesPerSec: 6 }

// baseline uses these leaderboard positions, top of the board is polluted
export const BASELINE_RANKS: [number, number] = [10, 50]
