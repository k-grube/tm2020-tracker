# tm2020-tracker

Deterministic screening of Trackmania 2020 ghost and replay files for the input and timing signatures seen in the 2026 scandal plus the 2021 slow-motion method. Own Gbx parser, no runtime dependencies in the core, same code in a Node CLI and a static web page.

Output never says "cheat". Every signal is a raw measurement next to reference points, the summary line is `needs human review: yes/no`, and a human decides.

## Web page

Drop `.Ghost.Gbx` or `.Replay.Gbx` files on the page. Parsing and analysis run in a Web Worker in the browser, nothing is uploaded. Several files at once get the cross-file signals when they share a map or a login.

The page never calls TMX or trackmania.io (no CORS). Paste a TMX online record uuid and the page links to `https://trackmania.exchange/getonlinerecord/<uuid>`, download that file and drop it.

## CLI

Node 22+, no build step.

```
node src/cli/main.ts dump <file> [--json] [--events N]
node src/cli/main.ts fetch (--map <tmxMapId> [--count N] [--uploads] | --campaign <tmioCampaignId> [--count N] | --ghost <uuid> | --search <name>) --out <dir>
node src/cli/main.ts analyze <file|dir>... [--json] [--baseline <file>]
node src/cli/main.ts baseline <dir> --out <file> [--ranks lo:hi]
```

- `dump`: chunk tree, decoded fields, hex of unknown chunks, first N input events
- `fetch --map`: lists TMX online records for a map and downloads each as `.Ghost.Gbx`, `--uploads` switches to user-uploaded replays. `--search` prints matching TMX map ids. Writes an `index.json` next to the files with position, map id, record time and record or replay id
- `fetch --campaign`: top N Nadeo records of every map in an official campaign through trackmania.io, the id is the number in `trackmania.io/#/campaigns/seasonal/<id>`. World records of the current campaign: `fetch --campaign 157584 --count 1 --out fixtures/wr` then `analyze fixtures/wr --baseline public/baseline.json`
- `analyze`: report per file, cross-file signals when files share a map or login, `--json` prints the same report the web page builds
- `baseline`: runs every single-file signal over a directory of fetched records and writes median, interquartile range and sample count per signal and per steer device. Ranks 10 to 50 by default, the top of a leaderboard is the polluted part. The result describes typical top records, not clean runs

## Signals

| id                       | level               | what                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wall_time_ratio`        | relative            | wall-clock duration of the recording (chunk `0x0309202C`, 1 s resolution) divided by race time. Slow-motion pushes this above 1 by a stable factor. Lag also pushes it above 1, so one file proves nothing, a stable ratio across a player's files is the pattern |
| `ticks_vs_racetime`      | absolute            | `ticks * 10 + start offset` vs race time, tolerance 2 ticks. Fires on a shortfall, truncated or edited inputs. Manual saves can carry extra ticks after the finish, those do not fire                                                                             |
| `same_tick_toggle`       | absolute            | an input pressed and released within one 10 ms tick, counted, first timestamps listed. Fires at 10, legit top records show up to 4 per run                                                                                                                        |
| `steer_spikes_per_sec`   | relative            | the 2021 metric. Steer direction changes per 1 s window ignoring deltas below 4 of 127. Average and max window. Reference: 2021 leaderboard average about 3, average of per-replay max about 6 (TMUF data)                                                        |
| `input_density`          | relative            | input events per race second, steer and other inputs separately. Low values on long maps are the low-input look                                                                                                                                                   |
| `steer_device`           | info                | keyboard (only -127, 0, 127 seen), pad (analog range), mixed. Baseline statistics are split by this                                                                                                                                                               |
| `steer_repetition`       | relative            | pad only. Longest exact repeat of a steer sequence of 50 ticks or more with at least 3 distinct values                                                                                                                                                            |
| `trajectory_overlap`     | relative, two files | same map, longest window where recorded positions stay within 0.1 m. Needs record data in both files. Two saves of one recording (same ghost uid) are skipped                                                                                                     |
| `checkpoint_split_match` | info, two files     | identical checkpoint times to the ms across files from one login                                                                                                                                                                                                  |
| `metadata`               | info                | login, nickname, recording context, exe version, unknown chunk ids                                                                                                                                                                                                |

`absolute` means the game cannot produce it. `relative` means an outlier against a reference and only fires when a baseline is loaded, outside the Tukey fence (1.5 IQR) for the file's device. `needs human review` is yes when any absolute signal fired or two or more relative signals fired. No percentile rank is ever shown, a rank reads as a probability and it is not one.

## Caveats

- no confirmed cheated TM2020 file has been run through this. Detector thresholds are informed guesses until one is
- the 2021 reference numbers come from TMNF/TMUF keyboard replays on a 65536-wide steer range, shown next to TM2020 pad data at 127 for scale only
- wall time has 1 s resolution, short maps get a wide ratio band
- action slot bit layout for slots 2 and 4 follows the common case, a known game quirk is not handled

## Development

```
npm ci
npm test
npm run lint
npm run dev
```

Fixtures live in `fixtures/` and are tracked, with `*.dump.json` goldens next to them. `fetch` output in any `fixtures/` subdirectory is git-ignored. Pages deploys from `main` via `.github/workflows/pages.yml`, base path `/tm2020-tracker/`.

## Prior art

- GBX.NET, BigBang1112. Chunk definitions used as the format reference. https://github.com/BigBang1112/gbx-net
- gbx-ts, thaumictom. MIT TypeScript Gbx parser. Not used: reading bodies needs the GPL `lzo-ts` package, this repo carries its own LZO1X decoder instead. https://github.com/thaumictom/gbx-ts
- TMX Replay Investigation, donadigo and Wirtual, 2021. Steer spike metric and reference numbers. https://donadigo.com/tmx1
- donadigo/gbxtools. The 2021 scripts, TMNF format. https://github.com/donadigo/gbxtools
- TM2020-TAS, Polybagel. https://github.com/Polybagel/TM2020-TAS
- Wirtual, "The New Trackmania Cheating Scandal", 2026-10-27. https://www.youtube.com/watch?v=cf0S-whkiEE
