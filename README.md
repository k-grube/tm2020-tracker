# tm2020-tracker

Screens Trackmania 2020 ghost and replay files for input and timing patterns that a hand on a controller does not produce. Own Gbx parser, no runtime dependencies in the core, one codebase for the CLI and the web page.

Every signal is a measurement next to its reference range. The summary line is `needs human review: yes/no`.

Page: https://k-grube.github.io/tm2020-tracker/

## Web page

Drop `.Ghost.Gbx` or `.Replay.Gbx` files on the page. Parsing and analysis run in a Web Worker, nothing leaves the browser. Files that share a map or a login get the cross-file signals.

The text field takes a record uuid, a TMX replay id, or a download url from `trackmania.exchange/getonlinerecord/<uuid>`, `trackmania.exchange/recordgbx/<id>` or `trackmania.io/api/download/ghost/<uuid>`. The url is rebuilt from the id. With `VITE_PROXY_URL` set at build time the page fetches the file through the proxy below, otherwise it links to the download.

### Download proxy

`worker/proxy.js` is a Cloudflare Worker. `GET /?url=<download url>`, hosts and paths limited to the three above, origins limited to `ALLOWED_ORIGINS`, CORS headers added to the response.

1. dash.cloudflare.com, Workers & Pages, Create application, Start with Hello World, Deploy
2. Edit code, paste `worker/proxy.js`, Deploy
3. Settings, Variables, `ALLOWED_ORIGINS` = `https://k-grube.github.io,http://localhost:5173`
4. GitHub repo, Settings, Secrets and variables, Actions, Variables, `VITE_PROXY_URL` = the worker url
5. local dev: `.env.local` with `VITE_PROXY_URL=https://<worker>.workers.dev`

`worker/wrangler.toml` covers `npx wrangler deploy` as an alternative.

## CLI

Node 22+, no build step.

```
node src/cli/main.ts dump <file> [--json] [--events N]
node src/cli/main.ts fetch (--map <tmxMapId> [--count N] [--uploads] | --campaign <tmioCampaignId> [--count N] | --ghost <uuid> | --search <name>) --out <dir>
node src/cli/main.ts analyze <file|dir>... [--json] [--baseline <file>]
node src/cli/main.ts baseline <dir> --out <file> [--ranks lo:hi]
```

- `dump`: chunk tree, decoded fields, hex of unknown chunks, first N input events
- `fetch --map`: TMX online records of a map as `.Ghost.Gbx`, `--uploads` for user-uploaded replays, `--search` for map ids. `index.json` next to the files holds position, map, record time and record or replay id
- `fetch --campaign`: top N Nadeo records of every map in an official campaign through trackmania.io, the id is the number in `trackmania.io/#/campaigns/seasonal/<id>`
- `analyze`: report per file plus cross-file signals, `--json` is the same report the page builds
- `baseline`: median, quartiles and sample count per signal and steer device over a directory of fetched records, ranks 10 to 50 by default

Current world records of a campaign:

```
node src/cli/main.ts fetch --campaign 157584 --count 1 --out fixtures/wr
node src/cli/main.ts analyze fixtures/wr --baseline public/baseline.json
```

## Signals

| id                       | level               | measures                                                                                                                                        |
| ------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `wall_time_delta`        | relative            | wall-clock duration of the recording (chunk `0x0309202C`, 1 s resolution) minus race time, in seconds. Fires above the reference only           |
| `wall_time_ratio`        | info                | the same as a ratio, aggregated per login across files                                                                                          |
| `ticks_vs_racetime`      | absolute            | decoded input ticks x 10 ms + start offset vs race time, tolerance 2 ticks. Fires when the inputs end before the finish                         |
| `same_tick_toggle`       | absolute            | inputs pressed and released within one 10 ms tick. Fires at 10                                                                                  |
| `steer_spikes_per_sec`   | relative            | steer direction changes per 1 s window, deltas below 4 of 127 ignored. Average, max window, and the 2021 references                             |
| `input_density`          | relative            | input events per race second, steer and other inputs                                                                                            |
| `steer_device`           | info                | keyboard (only -127, 0, 127), pad (analog range), mixed. References are split by this                                                           |
| `steer_repetition`       | relative            | pad only. Longest exact repeat of a steer sequence, 50 ticks or more, at least 3 distinct values                                                |
| `trajectory_overlap`     | relative, two files | same map, longest window where recorded positions stay within 0.1 m, first 4 s skipped. Two saves of one recording (same ghost uid) are skipped |
| `checkpoint_split_match` | info, two files     | identical checkpoint times to the ms across files from one login                                                                                |
| `metadata`               | info                | login, nickname, zone, club tag, map, model, exe build, race settings, validation seed, decode warnings                                         |

`absolute`: the game does not produce it. `relative`: outside the Tukey fence (1.5 IQR) of the loaded reference for the file's device, silent without a reference. `info`: never fires. `needs human review` is yes when an absolute signal fired or two or more relative signals fired.

`public/baseline.json` holds the reference ranges: 1004 TMX online records, ranks 10 to 50, the 25 Summer 2020 campaign maps plus 7 popular maps, built with `baseline`.

Signals that fire also carry the ticks they point at, shown as red bars on the steer trace.

## Caveats

- no file from a confirmed case has been run through this
- the 2021 references come from TMNF/TMUF replays
- wall time has 1 s resolution
- action slots 2 and 4 have an extra bit the decoder ignores

## Development

```
npm ci
npm test
npm run lint
npm run dev
```

Fixtures live in `fixtures/` with `*.dump.json` goldens. `fetch` output in `fixtures/*/` is git-ignored. `.github/workflows/pages.yml` deploys `main` to Pages at `/tm2020-tracker/`.

## Prior art

- GBX.NET, BigBang1112, the format reference. https://github.com/BigBang1112/gbx-net
- gbx-ts, thaumictom. https://github.com/thaumictom/gbx-ts
- TMX Replay Investigation, donadigo and Wirtual, 2021. https://donadigo.com/tmx1
- donadigo/gbxtools. https://github.com/donadigo/gbxtools
- TM2020-TAS, Polybagel. https://github.com/Polybagel/TM2020-TAS
- Wirtual, "The New Trackmania Cheating Scandal", 2026-10-27. https://www.youtube.com/watch?v=cf0S-whkiEE
