# tm2020-tracker

Screens Trackmania 2020 ghost and replay files for signs of a doctored run: the wall clock against the race time, the input stream against the recorded car state, the splits against the record data. The parser, the checks and the CLI are in this repo, the page runs the same code in the browser.

Page: https://k-grube.github.io/tm2020-tracker/

## Page

Drop `.Ghost.Gbx` or `.Replay.Gbx` files. A pasted record uuid, TMX replay id or download url becomes a download link, the page downloads nothing. Files stay in a tab strip across reloads. Dot per file: green nothing fired, amber a check fired, red needs review, gray did not parse. Every loaded file is analyzed as one set, the two-file checks run across all of them. The glossary under the report describes each check.

## CLI

Node 22+, no build step.

```
node src/cli/main.ts dump <file> [--json] [--events N]
node src/cli/main.ts fetch (--map <tmxMapId> [--count N] [--uploads] | --campaign <name|id> [--count N] | --ghost <recordId> | --search <name>) --out <dir>
node src/cli/main.ts analyze <file|dir>... [--json | --summary] [--baseline <file>]
node src/cli/main.ts baseline <dir> --out <file> [--ranks lo:hi]
```

- `dump`: chunk tree, decoded fields, hex of unknown chunks, first N input events
- `fetch`: records as `.Ghost.Gbx` plus an `index.json` with position, map, record time and ids. `--map` pulls TMX online records (`--uploads` for user replays, `--search` for map ids). `--campaign` pulls the top N of every map in an official campaign (`"Fall 2026"` or its id) from the Nadeo API and stores each record's account id and server stamp. `--ghost` pulls one record by its Nadeo record id the same way, removed records included, the output line says `removed`. Needs `NADEO_LOGIN` and `NADEO_PASSWORD` in `.env` or `.env.local`, a service account or dedicated server account from trackmania.com. `TM_OAUTH_CLIENT_ID` and `TM_OAUTH_CLIENT_SECRET` (an OAuth app on api.trackmania.com) add player names, without them the account id names the file. One request a second, a 25 map campaign at `--count 25` takes about 12 minutes
- `analyze`: report per file plus cross-file signals. `--json` is the report the page builds, `--summary` counts fired per signal. Reads `index.json` next to the files for the account check
- `baseline`: reference ranges per signal and steer device, plus the executable checksum per build, over a directory of fetched records, ranks 10 to 50 by default

Current world records of a campaign:

```
node src/cli/main.ts fetch --campaign "Fall 2026" --count 1 --out fixtures/wr
node src/cli/main.ts analyze fixtures/wr --baseline public/baseline.json
```

## Signals

| id                       | level                | measures                                                                                                                                                                                                                  |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `decode_failure`         | absolute             | the input stream or the position samples did not decode                                                                                                                                                                   |
| `wall_time_delta`        | relative             | wall-clock duration of the recording (1 s resolution) minus race time. Fires above the reference only                                                                                                                     |
| `wall_time_ratio`        | info                 | the same as a ratio, per login across files                                                                                                                                                                               |
| `ticks_vs_racetime`      | absolute             | input ticks x 10 ms + start offset against race time, tolerance 2 ticks. Fires when the inputs end before the finish                                                                                                      |
| `validation_consistency` | empirical            | the two validation copies agree, the two recording windows agree, end stamp set and after start, wall time at least the race time, start after the build date, seed 0 only on builds before 2022                          |
| `build_checksum`         | empirical            | executable checksum against the one the baseline saw with that build string, one per build in the baseline. An unseen build is listed and does not fire                                                                   |
| `login_account`          | absolute             | ghost login (base64url of the account uuid) against the account the leaderboard credits. Needs the record's leaderboard entry                                                                                             |
| `checkpoint_consistency` | absolute             | the three stored split lists agree, every split is after the start and after the previous one, the last equals the race time, the spawn landmark is none of the split landmarks                                           |
| `checkpoint_records`     | empirical            | every split but the finish has a checkpoint record in the record data at its exact ms, version 11 record data only. Lists the splits without one                                                                          |
| `sample_input_match`     | empirical            | steer, gas and brake in each 50 ms sample against the input stream at that tick or the one before, action key caps count as a match. Fires above 10% mismatch, steer rule for pad only                                    |
| `position_continuity`    | empirical            | distance between consecutive samples over speed x gap + 5 cm. Beyond 1.5x is a teleport, fires when teleports exceed the declared respawns. Last 200 ms and the second after a teleport skipped                           |
| `path_speed_ratio`       | empirical            | distance the positions cover over the distance the recorded speed allows, whole race, sim time coefficient applied. Fires above 1.05, the declared respawns exempt the largest jumps                                      |
| `car_path`               | empirical            | distance the positions cover inside the race per race second, legit records read 49 m/s and up. Fires below 25                                                                                                            |
| `input_structure`        | empirical            | one input entry, from the race start one contiguous vehicle state block with only kinds 14 and 15 around it, vehicle state within 38 ticks, steer never below -127. A break between vehicle blocks is marked on the trace |
| `same_tick_toggle`       | empirical            | press and release within one 10 ms tick. Fires at 10                                                                                                                                                                      |
| `steer_spikes_per_sec`   | relative             | steer direction changes per 1 s window inside the race, deltas below 4 of 127 ignored. Average, max window, 2021 references                                                                                               |
| `input_density`          | relative             | steer and button inputs per race second, mouse movement counted separately                                                                                                                                                |
| `steer_device`           | info                 | keyboard (only -127, 0, 127), pad, mixed. References are split by this                                                                                                                                                    |
| `steer_repetition`       | empirical            | pad only. Exact repeat of a steer sequence of 50 ticks or more with at least 8 distinct values                                                                                                                            |
| `trajectory_overlap`     | empirical, two files | same map, longest window with positions within 0.1 m at any shift up to 2 s, first 4 s skipped, fires at 6 s                                                                                                              |
| `split_copy`             | empirical, two files | different logins: same ghost uid or recording id, or four or more identical split times                                                                                                                                   |
| `checkpoint_split_match` | info, two files      | identical split times across files from one login                                                                                                                                                                         |
| `metadata`               | info                 | login, nickname, zone, club tag, map, model, samples, ghosts in a replay, build, race settings, validation seed, recording id, leaderboard account and stamp, decode warnings                                             |

`absolute`: the file contradicts itself. `empirical`: a fixed rule the legit corpus behind the baseline never trips. `relative`: outside the Tukey fence (1.5 IQR) of the reference for the file's device, silent without a reference. `info`: never fires. `needs human review`: an absolute or empirical signal fired, or two or more relative ones.

`public/baseline.json`: official campaign and popular map records at ranks 10 to 50, built with `baseline`. The page shows its record count.

Fired signals carry the ticks they point at, drawn as red bars on the steer trace.

## Caveats

- injected inputs, or slow motion with patched timestamps, leave a self-consistent file that passes every check
- the 2021 references come from TMNF/TMUF replays
- action slots 2 and 4 have an extra bit the decoder ignores

## Development

```
npm ci
npm test
npm run lint
npm run dev
```

`src/core` has no runtime dependencies and no platform imports, the CLI and the page wrap it. Fixtures live in `fixtures/` with `*.dump.json` goldens, `fetch` output in `fixtures/*/` is git-ignored. `.github/workflows/pages.yml` deploys `main` to Pages.

## Prior art

- GBX.NET, BigBang1112, the format reference. https://github.com/BigBang1112/gbx-net
- gbx-ts, thaumictom. https://github.com/thaumictom/gbx-ts
- TMX Replay Investigation, donadigo and Wirtual, 2021. https://donadigo.com/tmx1
- donadigo/gbxtools. https://github.com/donadigo/gbxtools
- TM2020-TAS, Polybagel. https://github.com/Polybagel/TM2020-TAS
- Wirtual, "The New Trackmania Cheating Scandal", 2026-10-27. https://www.youtube.com/watch?v=cf0S-whkiEE
