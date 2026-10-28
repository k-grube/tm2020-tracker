const ENTRIES: [string, string][] = [
  [
    'wall_time_delta',
    'how much longer the recording took on the wall clock than the race timer says, in seconds. a slowed-down game keeps the clock running while the race timer crawls, and the gap grows with race length. normal records sit a second or two above zero, lag and freezes also land here, which is why one file is a question and a pattern across files is an answer',
  ],
  [
    'wall_time_ratio',
    'the same gap as a factor, kept for the per-player view. the same factor on every file of one player is the slow-motion shape, a single high one is usually a freeze',
  ],
  [
    'ticks_vs_racetime',
    'the input stream has to run up to the finish line. one that stops short was cut or edited after the fact. inputs past the finish are normal, manual saves keep a few seconds',
  ],
  [
    'same_tick_toggle',
    'a key pressed and released inside one 10 ms tick. fingers cannot do it, scripts that play inputs back do it constantly. counted per run, a handful in a long run shows up in clean records',
  ],
  [
    'steer_spikes_per_sec',
    'how often the stick reverses direction, per second. in slow motion a hand gets time to make corrections nobody makes at full speed, so the count climbs. the 2021 investigation caught its cases on this number',
  ],
  [
    'input_density',
    'inputs per second of race time, steer and everything else counted separately. far below a human points at a scripted low-input run, far above at mouse steering or a wiggle macro',
  ],
  [
    'steer_device',
    'keyboard, pad or mixed, read from the steer values in the file. keyboard only ever writes -127, 0 and 127. the reference ranges are split by device because the two play nothing alike',
  ],
  [
    'steer_repetition',
    'the longest stretch of analog stick movement that repeats exactly somewhere later in the run. a hand does not reproduce half a second of stick values to the step, a recording played back twice does',
  ],
  [
    'trajectory_overlap',
    'two records on the same map within 10 cm of each other for seconds at a time. different drivers diverge within a second of leaving the start, a copied or spliced ghost tracks the original for as long as the copy lasts. needs two files on the same map',
  ],
  [
    'checkpoint_split_match',
    'one player, two files, every checkpoint split identical to the millisecond. that is one run saved twice, not two runs. needs two files from the same login',
  ],
  [
    'metadata',
    'who drove it and on what: login, nickname, zone, club tag, map, car, game build, race settings including the Openplanet mode, validation seed. an odd build or Developer mode is a lead on its own',
  ],
]

export function Glossary() {
  return (
    <details className="mt-10 text-sm">
      <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-300">
        what the checks look for
      </summary>
      <p className="mt-2 text-zinc-500">
        absolute: the game does not produce it, one hit is enough. relative: outside the range of
        top records with the same device, needs the baseline, two hits together mark the file. info:
        shown, never fires. red bars on the steer trace mark the ticks a fired check points at.
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
