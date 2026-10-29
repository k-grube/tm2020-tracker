const ENTRIES: [string, string][] = [
  [
    'decode_failure',
    'the input stream or the position samples did not decode, the line says which one and why',
  ],
  [
    'wall_time_delta',
    'wall clock minus race timer, in seconds. slow-mo keeps the clock running while the timer crawls, so the gap grows with race length. clean records sit +0.2 to +2.2 s. a freeze or lag spike also adds seconds, check the other files of that player before reading anything into one',
  ],
  [
    'wall_time_ratio',
    'same gap as a factor, used in the per-player view. look for the same factor on every file of one player',
  ],
  [
    'ticks_vs_racetime',
    'checks the input stream reaches the finish. inputs that stop early were cut or edited. extra ticks after the finish are normal, manual saves keep a few seconds',
  ],
  [
    'validation_consistency',
    'the two validation copies (chunks 02D and 025), the two recording windows (02C and 02D), the build date against the recording start, and a zero seed on a build after 2021. lists the rule that failed',
  ],
  [
    'build_checksum',
    'the game build string against the executable checksum the baseline corpus saw with it. a known build with another checksum ran a modified game. a build the corpus has not seen is listed without firing',
  ],
  [
    'login_account',
    'the login written into the ghost decoded to an account id, against the account the leaderboard credits the record to. only for files the cli pulled from a campaign leaderboard, a dropped file has no account to compare',
  ],
  [
    'checkpoint_consistency',
    'the split times are stored three times (chunks 00B, 01B, 02B) and the race time twice more. every copy must agree, every split comes after the start, the last split equals the race time, and the spawn landmark is none of the split landmarks',
  ],
  [
    'checkpoint_records',
    'the arena player writes a checkpoint record at the exact ms of every split it drives through. on 2026 builds every split but the finish has one, lists the split without',
  ],
  [
    'sample_input_match',
    'every 50 ms position sample also stores the steer, gas and brake the engine applied. compares them with the input stream at that tick, an action key caps the applied steer and is allowed. a run whose inputs were edited without rewriting the samples shows a high mismatch share. keyboard steer is ramped by the game, so only gas is compared there',
  ],
  [
    'position_continuity',
    'distance between consecutive position samples against the recorded speed times the gap. a jump is a teleport. the ghost declares its respawn count, every jump beyond that count is a seam or an edited position',
  ],
  [
    'path_speed_ratio',
    'distance the positions cover over the distance the recorded speed allows, whole race. position and speed are written by different parts of the engine, a run reads 1.00. a retimed or injected position stream reads above it, declared respawns exempt their jumps',
  ],
  [
    'car_path',
    'distance the positions cover inside the race per race second. records sit above 49 m/s, a car that never left the start reads 0, fires below 25',
  ],
  [
    'input_structure',
    'shape of the input stream: one entry, from the race start one contiguous vehicle state block, the vehicle state inside the first 38 ticks, steer never below -127. lists the rule that failed with the tick of every state change, a break between vehicle blocks is drawn on the trace',
  ],
  [
    'same_tick_toggle',
    'counts keys pressed and released inside one 10 ms tick. input playback scripts produce these. clean records show 0 to 4 per run, fires at 10',
  ],
  [
    'steer_spikes_per_sec',
    'stick direction reversals per second, averaged over the run. in slow-mo the count rises across the whole run because there is time to correct constantly. this is the 2021 investigation metric',
  ],
  [
    'input_density',
    'inputs per race second, steer and other inputs counted separately. well below the reference suggests a scripted low-input run, well above suggests mouse steering or a macro',
  ],
  [
    'steer_device',
    'keyboard, pad or mixed, from the steer values in the file. keyboard only writes -127, 0 and 127. references are split by device',
  ],
  [
    'steer_repetition',
    'longest stretch of analog stick values that repeats exactly later in the file. a repeat of 50 ticks or more with 8 distinct values in the window points at playback',
  ],
  [
    'trajectory_overlap',
    'two records on one map within 10 cm of each other for 6 s or more, at any time offset up to 2 s. a copied ghost or a copied segment tracks the original. needs two files on the same map',
  ],
  [
    'split_copy',
    'two logins, same map: the same ghost uid or recording id under both logins, or four or more split times identical to the ms at the same checkpoint. needs two files on the same map from different players',
  ],
  [
    'checkpoint_split_match',
    'one login, two files, every checkpoint split identical to the ms. means one run saved twice. needs two files from the same login',
  ],
  [
    'metadata',
    'login, nick, zone, club tag, map, car, game build, race settings (openplanet mode), validation seed. investigate if there is an odd build or Developer mode',
  ],
]

export function Glossary() {
  return (
    <details className="mt-10 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
        what the checks look for
      </summary>
      <p className="mt-2 text-zinc-500">
        absolute: one file contradicts itself, one hit flags the file. empirical: a fixed rule not
        seen in the legit corpus, one hit flags the file. relative: outside the top-record range for
        the device, needs the baseline, two hits flag the file. info: shown, never fires. red bars
        on the steer trace mark the ticks a fired check points at
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-[max-content_1fr]">
        {ENTRIES.map(([id, text]) => (
          <div key={id} className="contents">
            <dt className="font-mono text-zinc-700 dark:text-zinc-300">{id}</dt>
            <dd className="text-zinc-500">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
