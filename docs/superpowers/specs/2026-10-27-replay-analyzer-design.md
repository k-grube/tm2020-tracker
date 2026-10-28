# Replay cheat analyzer, design

Deterministic screening of Trackmania 2020 ghost and replay files for the cheat signatures seen in the Oct 2026 scandal (Wirtual, "The New Trackmania Cheating Scandal", 2026-10-27) plus the 2021 slow-motion method (donadigo, TMX Replay Investigation). Same analysis code runs as a Node CLI and inside a static web page on GitHub Pages.

## Intent

Right now a handful of players hand-analyze replay files when a record looks off. This tool makes that first pass mechanical: drop a file in, get the numbers and the flags, decide whether a human needs to look closer. It categorizes evidence, it does not decide guilt.

## Goals

- parse `.Ghost.Gbx` and `.Replay.Gbx` from TM2020 with our own code, no runtime dependencies
- extract: race time, checkpoint splits, respawns, per-tick inputs, wall time, ghost samples (position, velocity), raw anticheat and settings chunks
- run a fixed set of signal detectors and emit a report: one entry per signal with value, level, evidence
- CLI first, core library isomorphic (no Node APIs in `core`), web page last
- baseline distributions computed offline by the CLI over a batch of TMX files, shipped to the web page as JSON

## Non-goals

- no AI model anywhere in the analysis path
- no verdicts, no "cheated" label, no ban recommendations
- no Gbx writing
- no TMNF / TM2 / Turbo ghost support in v1 (different chunk layouts and input encoding)
- not a general-purpose Gbx library, only the chunks this tool needs

## Anti-goals

- a single-file output that reads as an accusation. Every signal is tagged `absolute` (engine or physics makes it impossible) or `relative` (outlier against a baseline) or `info`, and the summary says which kind fired
- depending on `lzo-ts` (GPL-3) or any third-party parser. gbx-ts and GBX.NET are referenced in the README as prior art, not imported
- thresholds buried in detector code. All tunables live in one constants module

## Constraints

- TM2020 only
- the browser cannot fetch TMX directly: `trackmania.exchange` sends no `Access-Control-Allow-Origin` (verified on `/api/...`, `/getonlinerecord/...`, `/recordgbx/...`). URL mode in the web page needs either a proxy or a manual download step. Decision deferred to the web milestone. trackmania.io behaves the same
- TMX API requires a `User-Agent` header
- stack: TypeScript, Vite, React, eslint, prettier (user standard). vitest for tests (my call). Single package, no workspace
- zlib via `DecompressionStream('deflate')` in browser and `node:zlib` in Node, behind one `inflate()` adapter. LZO1X decoder is our own
- project dir is not a git repo yet. `git init` plus the standard `.npmrc` (`ignore-scripts=true`) is the first plan task
- two fixture ghosts currently sit in the project root, they move to `fixtures/`

## Build order (from the user)

1. core parser + CLI `dump` that prints what a file contains
2. signal detectors on top of parsed data, CLI `analyze`
3. web page wrapping the same core, confirmed end to end on real files

## Package layout (my call)

```
src/core/      gbx container, lzo, bit reader, chunk readers, model types, signals, baseline
src/cli/       node entry (tsx), fetch, dump, analyze, baseline commands
src/web/       vite + react app, worker wrapper around core
fixtures/      real Ghost.Gbx / Replay.Gbx files, committed, with golden JSON next to each
docs/          this spec, plans, format notes
```

`core` must not import from `node:*`. The CLI and web each inject `inflate` and file IO.

## Sources of files

| source                                                      | url                                                                                                                                | returns                                                                                                                                | CORS                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| TMX online record (Nadeo leaderboard ghost mirrored by TMX) | `https://trackmania.exchange/getonlinerecord/<uuid>`                                                                               | `.Ghost.Gbx`, ~32 KB, root `CGameCtnGhost`                                                                                             | none                                              |
| TMX user-uploaded replay                                    | `https://trackmania.exchange/recordgbx/<ReplayId>`                                                                                 | `.Replay.Gbx`, ~2 MB (embeds the map), root `CGameCtnReplayRecord`                                                                     | none                                              |
| TMX replay listing                                          | `https://trackmania.exchange/api/replays?mapId=<id>&fields=ReplayId,User.Name,ReplayTime,ReplayAt,Position,IsBest,HasFile&count=N` | JSON, `{ More, Results[] }`                                                                                                            | none                                              |
| TMX online record listing                                   | `https://trackmania.exchange/api/maps/getonlinerecords?mapId=<id>&count=N`                                                         | JSON, `Results[]` of `{ Position, RecordTime, DisplayName, AccountId, RecordId, RecordAt }`, `RecordId` feeds `getonlinerecord/<uuid>` | none                                              |
| TMX map search                                              | `https://trackmania.exchange/api/maps?name=<text>&fields=MapId,Name,MapUid&count=N`                                                | JSON, `{ More, Results[] }`                                                                                                            | none                                              |
| trackmania.io leaderboard ghost                             | `https://trackmania.io/api/download/ghost/<uuid>`                                                                                  | `.Ghost.Gbx`, ~29 KB                                                                                                                   | none (preflight answers 204 without allow-origin) |

Replay.Gbx fixtures are large because of the embedded map, keep at most two in the repo.

## File format, verified and referenced

Verified on fixture `Slidrz_(00_24_794)_symmetrical-spring-2025-03.Ghost.Gbx` (32286 bytes):

- header: `GBX`, u16 version 6, u8 format `B`, u8 ref table compression `U`, u8 body compression `C`, u8 `R`, u32 class id (`0x03092000` CGameCtnGhost), u32 user data size (0, so no header chunks), u32 num nodes (2)
- reference table: u32 num external nodes (0)
- body: u32 uncompressed size (32809), u32 compressed size (32253), LZO1X stream. Body holds a zlib blob (`78 9c`) and a `PIKS` marker as literal runs, so compression ratio is near 1 on ghost files

Referenced from GBX.NET (`CGameCtnGhost.chunkl`, `CGameCtnGhost.PlayerInputData.cs`), to be confirmed byte by byte in milestone 1:

- body is a chunk sequence: u32 chunk id, then either raw fields (non-skippable) or u32 `PIKS` + u32 size + payload (skippable). Node ends at `0xFACADE01`
- node refs: i32 index. First sight of an index is followed by u32 class id and that node's chunk sequence
- lookback ids: first id read in a body is preceded by u32 id version. Each id is u32; flag `0x40000000` means a new string follows (u32 length, bytes), otherwise it is an index into already seen strings or a numeric id
- replay root `0x03093000` (CGameCtnReplayRecord): ghosts list lives in chunk `0x014`, the embedded map in `0x002`. Replay chunk layout is not yet verified, needs a `.Replay.Gbx` fixture (`recordgbx/151406` is one)

Ghost chunks this tool reads (ids relative to `0x03092000`):

| chunk   | skippable | fields                                                                                                                                                                                                                                                                                                  |
| ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0x000` | no        | version, v9+ AppearanceVersion, ident PlayerModel, vec3 LightTrailColor, packdesc list SkinPackDescs, bool HasBadges (+Badge), v1+ string, GhostNickname, GhostAvatarName, v2+ RecordingContext, v4+ bool, v5+ CPlugEntRecordData RecordData + int[], v6+ GhostTrigram, v7+ GhostZone, v8+ GhostClubTag |
| `0x005` | yes       | timeint RaceTime                                                                                                                                                                                                                                                                                        |
| `0x008` | yes       | int Respawns                                                                                                                                                                                                                                                                                            |
| `0x00B` | yes       | Checkpoint[] (timeint Time, v1 int StuntsScore)                                                                                                                                                                                                                                                         |
| `0x00C` | no        | int                                                                                                                                                                                                                                                                                                     |
| `0x00E` | no        | GhostUid                                                                                                                                                                                                                                                                                                |
| `0x00F` | no        | string GhostLogin                                                                                                                                                                                                                                                                                       |
| `0x010` | no        | id Validate_ChallengeUid                                                                                                                                                                                                                                                                                |
| `0x01C` | no        | uint256 SecurityKey256                                                                                                                                                                                                                                                                                  |
| `0x01D` | yes       | version, PlayerInputData[]                                                                                                                                                                                                                                                                              |
| `0x022` | yes       | version, SettingsInfos[]                                                                                                                                                                                                                                                                                |
| `0x023` | yes       | anticheat blob, kept raw                                                                                                                                                                                                                                                                                |
| `0x02C` | yes       | version, unixtime WalltimeStartTimestamp, unixtime WalltimeEndTimestamp                                                                                                                                                                                                                                 |

Every other skippable chunk is skipped by size and listed by id in `dump` output. An unknown non-skippable chunk is a hard parse error naming the chunk id.

PlayerInputData: int Version (12 on TM2020), int, timeint StartOffset (chunk v4+), int Ticks, u32 length + bytes. Tick i is at `i * 10 ms + StartOffset`. Per tick, in a bit reader:

```
if ReadBit() == 0:                  state changed
  if ReadBit() == 1:  s = Read(2)   short form, vehicle bit1 = horn
  else:               s = Read(34, or 33 when Version == 11)
                      low 4 bits: 0 not started, 2..4 vehicle, 1 character
                      bit 6 horn, bit 12 jump, bit 13 freelook, bits 14..22 action slot 1..9,
                      bit 23 action slot 0, bit 31 respawn, bit 33 secondary respawn
if ReadBit() == 0:  mouseX = ReadU16(); mouseY = ReadU16()
vehicle: if ReadBit() == 0:  steer = ReadI8() (-127..127); gas = ReadBit(); brake = ReadBit()
```

Events are emitted on change against the previous full state. Trailing bytes must be zero. Bit order of the reader is unverified; the first parser task is to make the fixture's tick count and event stream self-consistent (ticks * 10 ms ~ RaceTime, steer stays in range, no trailing garbage).

RecordData (`CPlugEntRecordData`, chunk `0x0911F000`): version, uncompressed size, compressed size, zlib data. Decoded sample layout for TM2020 vehicles is taken from GBX.NET source during milestone 1b. Only the trajectory signals need it, so it lands after inputs.

## Signals, v1

Each detector returns `{ id, level, value, evidence[], reference? }`. `level` is `absolute`, `relative`, or `info`. Relative signals show the raw value next to reference points: the published 2021 numbers where they exist (average about 3 spikes/s, average of per-replay max about 6) and, when a baseline is loaded, the typical range of the population (median and interquartile range for the file's device). No percentile rank is ever computed for a file (user decision: a rank reads as a probability of cheating, which it is not).

| id                       | level                | what                                                                                                                                                                                                                                                                                       |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wall_time_delta`        | relative             | `(WalltimeEnd - WalltimeStart) - RaceTime` in seconds, the fenced form of the ratio: the legit band is 0.2 to 2.2 s on any map length while the ratio band scales with 1/RaceTime                                                                                                          |
| `wall_time_ratio`        | info                 | `(WalltimeEnd - WalltimeStart) / RaceTime`. Slow-mo pushes this above 1 by a stable factor. Lag also pushes it above 1, so single-file output states the timestamp resolution and compares to baseline. Across several files from one player, a stable ratio above 1 is the Socrat pattern |
| `ticks_vs_racetime`      | absolute             | `Ticks * 10 + StartOffset` vs `RaceTime`, tolerance 2 ticks. Mismatch means truncated or edited inputs                                                                                                                                                                                     |
| `same_tick_toggle`       | absolute             | any input pressed and released within 1 tick, or alternating every tick. Count, first timestamps, fires at 10 (1220 legit top records max out at 4). The Lacyop action key pattern                                                                                                         |
| `steer_spikes_per_sec`   | relative             | 2021 metric. Steer direction changes per 1 s window, ignoring deltas below 4 (of 127). Report average and max                                                                                                                                                                              |
| `input_density`          | relative             | input events per race second, split by steer and by binary inputs. Low values on long maps are the low-input / scripted look                                                                                                                                                               |
| `steer_device`           | info                 | keyboard (only -127, 0, 127 seen), pad (analog range), mixed. Baselines split by this                                                                                                                                                                                                      |
| `steer_repetition`       | relative             | pad only. Longest exact repeat of a steer sequence (length >= 50 ticks) anywhere in the run, and share of ticks spent at exactly repeated analog values                                                                                                                                    |
| `trajectory_overlap`     | relative, multi-file | same map, two files: longest window where sample positions stay within 0.1 m. The Meu pattern. Needs RecordData                                                                                                                                                                            |
| `checkpoint_split_match` | info, multi-file     | identical checkpoint times to the ms across different files from one login                                                                                                                                                                                                                 |
| `metadata`               | info                 | login, nickname, RecordingContext, settings chunk decoded where known, anticheat chunk hex, exe version if present                                                                                                                                                                         |

Categorization in the summary: list of absolute signals that fired, list of relative signals outside their reference range, device, and a one-line "needs human review: yes/no" derived only from absolute signals and relative count. The word "cheat" does not appear in output.

Multi-file mode (`analyze <dir>`, or several files dropped on the page) groups twice: by map (`Validate_ChallengeUid`) for `trajectory_overlap` and `checkpoint_split_match`, and by login (`GhostLogin`) for `wall_time_ratio` (count, mean, spread). Report shape is `{ files[], groups: { byMap[], byLogin[] } }` in both CLI and web.

## Baselines

Population (my call): TMX online records only, `.Ghost.Gbx` via `getonlinerecords` -> `getonlinerecord/<RecordId>`, top 50 per map across the official campaign maps TMX hosts (map search by season name). Same file type as the fixtures, so `.Replay.Gbx` parsing is not on the baseline's critical path. User-uploaded replays are never mixed into the baseline.

Top 50 is polluted (the point of the video), so `baseline` uses ranks 10 to 50 and median-based statistics. The result describes typical top records, not clean runs, and the report wording says so.

CLI `baseline <dir>` runs every single-file signal over a directory and writes, per signal and per `steer_device`, the median, interquartile range, and sample count to `baseline.json`. The web page ships a committed `baseline.json`. The CLI `analyze` accepts `--baseline <file>`. The baseline is only valid for signals present in the population, so `baseline` records which chunks were found in what share of files and `analyze` reports "no reference" for a signal whose chunk was absent in the population.

## CLI

- `fetch --map <tmxMapId> [--count N] --out <dir>`: lists online records via `getonlinerecords` and downloads each `getonlinerecord/<RecordId>` as `.Ghost.Gbx`. `--uploads` switches to the user-replay listing and `recordgbx/<ReplayId>`. `fetch --ghost <uuid>` downloads one online record. `fetch --search <name>` prints matching map ids. Sends a `User-Agent`
- `dump <file>`: chunk tree, decoded fields, hex of unknown chunks, first N input events. The parser development tool
- `analyze <file|dir|url> [--baseline f] [--json]`: report per file, multi-file signals when more than one file shares a map
- `baseline <dir> --out baseline.json`

## Web

Vite + React, static build to GitHub Pages. Drop one or more files. Core runs in a Web Worker. Per-signal cards with evidence, a steer trace, an input timeline, checkpoint table. Multi-file view when files share a map. URL mode decision (proxy vs instructions to download) is made at this milestone, not before.

## Testing

- vitest. Fixtures are real files under `fixtures/`, each with a golden JSON next to it (`dump` output). Parser tests compare to golden
- LZO decoder: fixture body must decompress to exactly the header's uncompressed size, and the embedded zlib blob must inflate
- bit reader and input decoder: fixture ticks and race time agree, all steer values in range, no trailing nonzero bytes
- signals: synthetic input streams built in tests for each detector (a toggle within one tick, a 60 spikes/s burst, a keyboard-only run, a pad run with an exact repeated block)
- web (my call, no browser test runner in v1): a Node test calls the web pipeline function with the browser `inflate` adapter (`DecompressionStream` is global in Node 18+) and asserts the report JSON equals the CLI's for each fixture. The worker is not exercised by tests. Milestone 3 acceptance is a manual drop of both fixtures in the built site, output compared to the CLI by eye

## Left to the builder

- LZO1X decoder internals
- bit reader bit order (verify against fixture)
- exact threshold values, all in one constants module
- RecordData sample decoding details
- chart approach in the web page (inline SVG preferred, no chart library)
- worker and file IO plumbing
- the TMX replay listing paging (`More` flag) and rate limiting in `fetch`

## Prior art (goes in README)

- GBX.NET, BigBang1112. Chunk definitions used as the format reference. https://github.com/BigBang1112/gbx-net
- gbx-ts, thaumictom. MIT TypeScript Gbx parser, referenced not used. https://github.com/thaumictom/gbx-ts
- TMX Replay Investigation, donadigo and Wirtual, 2021. Steer spike metric. https://donadigo.com/tmx1
- TM2020-TAS, Polybagel. https://github.com/Polybagel/TM2020-TAS
- Wirtual, "The New Trackmania Cheating Scandal", 2026-10-27. https://www.youtube.com/watch?v=cf0S-whkiEE
