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

// steer_repetition: shortest exact repeat worth reporting. pad players who tap full lock repeat
// patterns of 3 to 6 values for seconds, 878 legit pad files hold no repeat with 8 values
export const REPEAT_MIN_LEN_TICKS = 50
export const REPEAT_MIN_DISTINCT_VALUES = 8

// steer_device
export const KEYBOARD_STEER_VALUES = [-127, 0, 127]
export const PAD_MIN_DISTINCT_STEER = 16

// trajectory_overlap: same position within this distance, for at least this long, ignoring the start
// block. launch straights keep two cars on one line past the skip: 29590 legit pairs, one reaches
// 5050 ms (summer-2020-02), the next 2100 ms, none 6000 ms
export const TRAJECTORY_EPS_M = 0.1
export const TRAJECTORY_MIN_WINDOW_MS = 6000
// countdown and launch straight overlap for every pair, 29590 legit pairs stop overlapping by 4 s
export const TRAJECTORY_SKIP_START_MS = 4000
// longest sample span two files are stepped through, file-declared times past this are not compared
export const TRAJECTORY_MAX_SPAN_MS = 2 * 60 * 60 * 1000
// positions are compared on a 50 ms grid, the car is sampled on that grid, at every time shift up
// to 2 s either way so a donor segment with a different split still lines up
export const TRAJECTORY_STEP_MS = 50
export const TRAJECTORY_SHIFT_MS = 2000

// sample_input_match: share of race samples whose steer or gas byte disagrees with the inputs.
// legit pad records sit at 0 to 1%, two 2020-build files reach 32% and 43%
export const SAMPLE_INPUT_MAX_MISMATCH = 0.1
export const SAMPLE_INPUT_MIN_SAMPLES = 20
// action keys cap or scale the applied steer to a fixed share of the stick, the sample shows the
// capped value while the stream keeps the stick (map 15 of fall 2026: -102 and 77 of 127 for seconds)
export const ACTION_KEY_FACTORS = [0.2, 0.4, 0.6, 0.8]
export const SAMPLE_STEER_TOLERANCE = 1

// position_continuity: displacement over max(speed) x dt + slack between consecutive samples, the
// corpus maximum is 1.32. the last samples land on the finish line, and a respawn (the input stream
// records one of five) teleports then settles for about a second, both windows are skipped
export const CONTINUITY_SPEED_FACTOR = 1.5
export const CONTINUITY_SLACK_M = 0.05
export const CONTINUITY_EXCLUDE_MS = 200
export const CONTINUITY_SETTLE_MS = 1000

// path_speed_ratio: distance the positions cover over what the recorded speed allows, summed over
// the race. 1878 legit no-respawn records read 0.998 to 1.000, the removed record reads 3.14
export const PATH_SPEED_MAX_RATIO = 1.05
export const PATH_SPEED_MIN_PAIRS = 20

// car_path: distance the positions cover inside the race per race second, 1891 legit records read
// 49 m/s and up, a car parked at the start reads 0, a 1.5 s finish after 16 m reads 11
export const CAR_PATH_MIN_MS = 25
export const CAR_PATH_MIN_SAMPLES = 20

// checkpoint_records: version 11 record data carries an arena checkpoint record at the exact ms of
// every split but the finish in 773 of 773 legit records, version 10 builds write none
export const CHECKPOINT_RECORDS_MIN_VERSION = 11

// input_structure: across 1247 records the vehicle state (2) is one contiguous block, the only
// other full-state kinds are 14 and 15 (before the block or at the finish), and the block starts
// within the first ticks
export const INPUT_OTHER_KINDS = [14, 15]
export const FIRST_VEHICLE_MAX_TICK = 38

// split_copy: identical split times across two logins on one map. 37690 legit pairs: 2316 share one
// split to the ms, 110 share two, 4 share three (short campaign maps with one line, positions never
// overlap), none share four
export const SPLIT_COPY_MIN_MATCHES = 4

// wall time chunk stores unix seconds, an end that was never written reads as all ones
export const WALL_TIME_RESOLUTION_S = 1
export const UNSET_U32 = 0xffffffff

// validation_consistency: five 2021 builds in the corpus write seed 0, every later build writes one
export const VALIDATION_SEED_ZERO_MIN_BUILD = Date.UTC(2022, 0, 1) / 1000

// relative signals fire outside q1 - k*IQR .. q3 + k*IQR of the baseline
export const TUKEY_K = 1.5

// published 2021 TMX investigation numbers (United leaderboard average)
export const REF_2021 = { avgSpikesPerSec: 3, avgMaxSpikesPerSec: 6 }

// baseline uses these leaderboard positions, top of the board is polluted
export const BASELINE_RANKS: [number, number] = [10, 50]
