const ENTRIES: [string, string][] = [
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
    'longest stretch of analog stick values that repeats exactly later in the file. a repeat of 50 ticks or more to the step points at playback',
  ],
  [
    'trajectory_overlap',
    'two records on one map within 10 cm of each other for seconds. real drivers separate within a second of the start, a copied ghost tracks the original. needs two files on the same map',
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
        absolute: the game cannot produce it, one hit flags the file. relative: outside the
        top-record range for the device, needs the baseline, two hits flag the file. info: shown,
        never fires. red bars on the steer trace mark the ticks a fired check points at
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
