# Replay Cheat Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A TypeScript core that parses TM2020 `.Ghost.Gbx` / `.Replay.Gbx` files and scores them against fixed cheat signals, exposed first as a Node CLI and then as a static Vite/React page on GitHub Pages.

**Architecture:** `src/core` is a dependency-free, platform-neutral library: Gbx container + LZO1X + chunk readers -> model types -> input bit decoder and sample decoder -> signal detectors -> report. `src/cli` wraps it with Node file IO, `node:zlib`, and TMX HTTP. `src/web` wraps the same functions in a Web Worker with `DecompressionStream`. Platform code injects an `inflate` function into core.

**Tech Stack:** TypeScript 7, Node 22 (runs `.ts` directly, so no tsx), Vite 8, React 19, vitest 5, eslint 10 + typescript-eslint, prettier 3. No runtime dependencies in core.

**Spec:** `docs/superpowers/specs/2026-10-27-replay-analyzer-design.md`

## Global Constraints

- `src/core/**` never imports `node:*` or anything outside `src/core` (enforced by eslint `no-restricted-imports` in Task 1)
- no runtime dependency anywhere except `react` and `react-dom` for the web page; no `lzo-ts`, no `gbx`
- TM2020 only; an unknown non-skippable chunk is a hard error naming class id and chunk id
- the string `cheat` (any case) never appears in report output
- every threshold and reference number lives in `src/core/signals/constants.ts`
- relative signals never produce a percentile; with a baseline they show median and interquartile range, always the 2021 reference numbers where defined
- comments and docs follow the user's CLAUDE.md voice rules: terse, no decorative comments, no em-dashes, ASCII `->`
- commits: `type: terse lowercase subject`, no Co-Authored-By or generated-with trailers anywhere
- branch per phase off `main`: `feat/core-parser`, `feat/signals`, `feat/web`. Stop before push at the end of each phase and print branch, commit subjects, files changed
- dependency installs are gated: show name, exact version, weekly downloads, publish date, transitive count from `npm i <pkg>@<ver> --package-lock-only --dry-run`, wait for approval, install with `--save-exact`. Versions younger than 2 days are not installed without explicit approval
- network downloads of fixture files are gated: state filename, source url, size, wait for approval

## Review Focus

Inputs the spec implies but no test exercises on real data. Each line's test is attached to the owning task.

1. A ghost whose `0x01D` input chunk is absent (old ghost or stripped) must still produce a report with `info` signals and "no inputs" evidence, not a crash. Test in Task 17.
2. A body whose LZO stream is truncated or whose decompressed length differs from the header must throw a named error, never return partial bytes silently. Test in Task 4.
3. A `.Replay.Gbx` with a MediaTracker clip (`0x015` node index != -1) must still yield the ghosts read from `0x014` plus a warning. Test in Task 11.
4. Two files on the same map from different logins must not be paired for `checkpoint_split_match` (login-scoped) but must be paired for `trajectory_overlap` (map-scoped). Test in Task 18.
5. A keyboard-only file must mark `steer_repetition` as not applicable, not as fired. Test in Task 16.

---

## Format reference

Pinned from GBX.NET source (`CGameCtnGhost.chunkl`, `CGameCtnGhost.cs`, `CGameGhost.chunkl`, `CGameCtnReplayRecord.cs`, `CPlugEntRecordData.*`, `CSceneVehicleVis.EntRecordDelta.cs`, `GbxReader.cs`, `BitReader.cs`) and verified on the two fixtures where stated. All integers little-endian.

**Primitive encodings:** `u8 u16 u32 i32 i64 f32`; `bool` = u32 (0/1); `string` = i32 byte length + UTF-8; `data` = i32 length + bytes; `timeint` = i32 ms, `-1` means null; `unixtime` = u32 seconds; `vec3` = 3 x f32; `checksum256` = 32 bytes; `list<T>` / arrays = i32 count + items; `int[]` = i32 count + i32s.

**Header** (verified): `47 42 58` magic, u16 version (6), u8 format (`B`), u8 refTableCompression (`U`), u8 bodyCompression (`C` compressed / `U`), u8 unknown (`R`), u32 classId, [version >= 6] u32 userDataSize, user data (below), u32 numNodes. **User data**: if size > 0: i32 numChunks (0..255), table of numChunks x (u32 chunkId, u32 sizeField where bit 31 = heavy flag, size = sizeField & 0x7FFFFFFF), then payloads in table order; sum must equal userDataSize. **Reference table**: u32 numExternalNodes; if > 0 throw `UnsupportedError('external references')`. **Body**: if compressed: u32 uncompressedSize, u32 compressedSize, LZO1X bytes; else raw chunk stream.

**Lookback ids:** state `{ version: number | null, seen: string[] }` shared across header chunks and body of one file. On first id read: u32 version (must be >= 3). Then each id: u32 `index`; `0xFFFFFFFF` -> empty string; if `(index & 0xC0000000)` is neither `0x40000000` nor `0x80000000` -> numeric id, return decimal string; else if `(index & 0x3FFFFFFF) == 0` -> read `string`, push to `seen`, return it; else return `seen[(index & 0x3FFFFFFF) - 1]`. `ident` = id, id, id (id, collection, author). If the replay fixture fails at the first body id, retry with a fresh id state for the body (GBX.NET carries state from header to body; unverified).

**PackDesc:** u8 version; if version >= 3: 32-byte checksum; `string` filePath; if (filePath non-empty and version >= 1) or version >= 3: `string` locatorUrl.

**Chunk stream of a node:** loop: u32 chunkId; if `0xFACADE01` -> node ends. Peek next u32: if `0x534B4950` (`PIKS`) -> skippable: consume marker, u32 size, payload of size bytes (dispatch to reader if known, else keep raw under hex id); else non-skippable: dispatch to reader, unknown -> throw `UnknownChunkError(classId, chunkId)`. Chunk ids are full ids (`0x0309201D`), including parent-class chunks that appear inside the node (`0x0303F006` in a ghost).

**Node reference:** i32 index; `-1` -> null; index already seen -> that node; else u32 classId, read that node's chunk stream, register under index.

**CGameGhost chunks** (in every ghost, before CGameCtnGhost chunks; verified on fixture): `0x0303F006` non-skippable: bool isReplaying, i32 uncompressedSize, data (zlib, ignored). `0x0303F007` skippable, ignore.

**CGameCtnGhost chunks** (`0x03092xxx`):

| id     | skip | fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `000`  | no   | u32 version; if version >= 9: u32 appearanceVersion else 0; ident playerModel; vec3 lightTrailColor; list<packdesc> skinPackDescs; bool hasBadges; if hasBadges: badge = { i32 version, vec3 color, if version == 0: i32 + string, list<{string,string}> stickers, list<string> layers }; if appearanceVersion >= 1: string; string nickname; string avatarName; if version >= 2: string recordingContext; if version >= 4: bool; if version >= 5: noderef recordData (`CPlugEntRecordData`), int[]; if version >= 6: string trigram; if version >= 7: string zone; if version >= 8: string clubTag |
| `005`  | yes  | timeint raceTime                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `008`  | yes  | i32 respawns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `00B`  | yes  | u32 version; list<{ timeint time, if version == 0: f32 speed, if version == 1: i32 stuntsScore }> checkpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `00C`  | no   | i32                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `00E`  | no   | id ghostUid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `00F`  | no   | string login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `010`  | no   | id mapUid                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `013`  | yes  | i32, i32                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `014`  | yes  | i32 ghostVersion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `01A`  | yes  | i32 checkpointCount                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `01C`  | no   | 32 bytes securityKey                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `01D`  | yes  | u32 version; list<PlayerInputData> where PlayerInputData = { i32 version (12 on TM2020), i32 u01, if chunk version >= 4: timeint startOffset, i32 ticks, data }                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `022`  | yes  | keep raw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `023`  | yes  | keep raw (anticheat)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `02C`  | yes  | u32 version; unixtime wallStart; unixtime wallEnd                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `02D`  | yes  | i32 u01 (if >= 1: stop, "inputs stored separately"); string exeVersion; u32 exeChecksum; i32 osKind; i32 cpuKind; unixtime wallStart; unixtime wallEnd; string titleId; checksum256 titleChecksum; i32; i32; i32 validationSeed; i32; string raceSettings                                                                                                                                                                                                                                                                                                                                           |
| others | yes  | keep raw, list id in `unknownChunks`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Wall time resolution is 1 second. Which of `02C` / `02D` the fixtures carry is found by `dump` in Task 8; both readers exist.

**Input bit decoding** (`PlayerInputData.data`, LSB-first bit reader: bit n is bit `n % 8` of byte `n / 8`; multi-bit values assemble first-read bit into bit 0; `ReadI8` = 8 bits as two's complement; `ReadU16` = 16 bits; nothing ever byte-aligns):

```
state = NotStarted; prevFull = none; prevSteer = 0; prevGas = 0; prevBrake = 0; mouse = (0,0)
for tick in 0..ticks-1:
  if bit() == 0:                                # state changed
    if bit() == 1:  s = read(2)                 # short form: vehicle bit1 = horn
    else:
      s = read(version == 11 ? 33 : 34)         # 64-bit value
      kind = s & 0xF: 0 NotStarted, 1 Character, 2|3|4 Vehicle, 0xC|0xD throw 'float steer unsupported'
      state = kind
      diff against prevFull: bit 6 horn, bit 12 jump, bit 13 freeLook, bits 14..22 actionSlot 1..9 (slots 2 and 4 also require bit 7), bit 23 actionSlot 0, bit 31 respawn, bit 33 secondaryRespawn
      prevFull = s
  if bit() == 0: mouseX = readU16(); mouseY = readU16()      # emit 'mouse' on change
  if state == Vehicle and bit() == 0:
    steer = readI8(); gas = bit(); brake = bit()              # emit on change vs prev
  if state == Character and bit() == 0: read(2) x4           # strafe, walk, vertical, horizontal; ignore
on IndexOutOfRange: stop (tolerated end-of-buffer case)
after loop: every remaining whole byte must be 0, else throw 'trailing input data'
timeMs(tick) = tick * 10 + (startOffset ?? 0)
```

**CPlugEntRecordData** (`0x0911F000`): chunk `0x0911F000`: u32 version; if version >= 5: i32 uncompressedSize, data compressed (zlib). Decompressed body: if v >= 1: timeint start, timeint end; list<EntRecordDesc { u32 classId, i32, i32, i32, data, i32 }>; if v >= 2: list<NoticeRecordDesc { i32, i32, if v >= 4: u32 classId }>; entList: loop while u8 != 0: { i32 type, i32, i32, i32, if v >= 6: i32; samples (v >= 11): i32 numSamples, if > 0: i32 sampleSize, numSamples x timeint deltaTime, then for byteIndex in 0..sampleSize-1: numSamples bytes, each sample's byte = running wrapping sum within that column; times cumulative; then (v >= 2) loop while u8 != 0: { i32 type2, timeint t, data } }. Remaining sections (bulk notices v >= 3, custom modules v >= 7) are not read: stop after entList. Vehicle entity: `classId == 0x0A018000`.

**Vehicle sample payload** (fixed offsets, sampleSize >= 103): offset 47: transform = vec3 position (f32 x3), u16 angle, i16 axisHeading, i16 axisPitch, i16 logSpeed, i8 velHeading, i8 velPitch (22 bytes). `speedMs = exp(logSpeed / 1000)`. Offset 14: u8 steer `(b/255 - 0.5) * 2`; offset 15: u8 gas; offset 18: u8 brake; offset 91: u8 gear `(b - 1) / 4`. Only position and speedMs are required by the signals.

**CGameCtnReplayRecord** (`0x03093000`): header chunk `0x03093000`: u32 version; if version >= 4 and != 9999: ident mapInfo, timeint time, string nickname, if version >= 6: string login; if version > 7: u8, id titleId. Body: `0x03093002` non-skippable: data (embedded map, keep length only); `0x03093014` non-skippable: list of noderef ghosts, i32 (0), list<i64>; `0x03093015` non-skippable: noderef clip. Parsing stops after `0x03093014` is read, so `0x015` and later are never touched. Node refs inside `0x014` are full `CGameCtnGhost` nodes read with the ghost reader.

**LZO1X decompression** (stream of instructions; `out` grows to `dstSize`):

```
ip = 0; state = 0
t = in[ip]
if t > 17: ip++; t -= 17; copy t literals; state = 4
loop:
  t = in[ip++]
  if t < 16:
    if state == 0:                                   # long literal run
      if t == 0: while in[ip] == 0: t += 255; ip++ ; t += 15 + in[ip++]
      copy t + 3 literals; state = 4; continue
    if state == 4: off = (t >> 2) + (in[ip++] << 2) + 2049; copy 3 from out[op - off]
    else:          off = (t >> 2) + (in[ip++] << 2) + 1;    copy 2 from out[op - off]
    trail = t & 3
  elif t >= 64:                                      # M2
    len = (t >> 5) + 1; off = ((t >> 2) & 7) + (in[ip++] << 3) + 1; copy len; trail = t & 3
  elif t >= 32:                                      # M3
    len = t & 31; if len == 0: while in[ip] == 0: len += 255; ip++ ; len += 31 + in[ip++]
    w = in[ip] | (in[ip+1] << 8); ip += 2; off = (w >> 2) + 1; copy len + 2; trail = w & 3
  else:                                              # M4 (16..31)
    off = (t & 8) << 11; len = t & 7; if len == 0: while in[ip] == 0: len += 255; ip++ ; len += 7 + in[ip++]
    w = in[ip] | (in[ip+1] << 8); ip += 2; off += w >> 2; trail = w & 3
    if off == 0: end of stream (must have written exactly dstSize); off += 0x4000; copy len + 2
  copy trail literals; state = trail
copy from out[op - off] byte by byte (overlap allowed)
```

**TMX endpoints** (all need a `User-Agent`): `GET /api/maps?name=<text>&fields=MapId,Name,MapUid&count=N` -> `{ More, Results[] }`; `GET /api/maps/getonlinerecords?mapId=<id>&count=N` -> `{ Results: [{ Position, RecordTime, DisplayName, AccountId, RecordId, RecordAt }] }`; `GET /getonlinerecord/<RecordId>` -> `.Ghost.Gbx`; `GET /api/replays?mapId=<id>&fields=ReplayId,User.Name,ReplayTime,ReplayAt,Position,IsBest,HasFile&count=N` -> `{ More, Results[] }`; `GET /recordgbx/<ReplayId>` -> `.Replay.Gbx`.

---

## Phase A: core parser and CLI `dump` (branch `feat/core-parser`)

### Task 1: Repository scaffold

**Files:**

- Create: `.gitignore`, `.npmrc`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc`, `README.md`, `src/core/smoke.test.ts`
- Move: both `*.Ghost.gbx` files from repo root into `fixtures/`, and `That_Ski_Freak_$i$s$396A$275l$253i$122v$000e_PersonalBest_TimeAttack.Replay.Gbx` into `fixtures/tmx-151406.Replay.Gbx` (the `$` codes in the name are Trackmania color formatting, drop them)

**Interfaces:**

- Produces: `npm test`, `npm run lint`, `npm run format:check`, `npm run cli -- <args>` (= `node src/cli/main.ts`)

- [ ] **Step 1: Init repo and gate the dependency install**

```bash
git init -b main
printf 'ignore-scripts=true\n' > .npmrc
```

Dev deps to propose, exact versions as of 2026-10-27 (publish date, weekly downloads): `vite@8.3.5` (2026-10-21, 171M), `@vitejs/plugin-react@6.1.2` (2026-10-05, 83M), `typescript@7.0.2` (2026-07-08, 267M), `vitest@5.0.5` (2026-10-15, 114M), `eslint@10.13.0` (2026-10-16, 136M), `typescript-eslint@8.72.1` (2026-10-26, 77M; inside the 2-day cooldown, installed anyway on the user's explicit call because it is the first release that works on TypeScript 7), `eslint-plugin-react-hooks@7.1.1` (2026-04-17, 81M), `eslint-config-prettier@10.1.8` (2025-07-18, 46M), `prettier@3.9.10` (2026-10-10, 119M), `@types/node@26.6.5` (2026-10-09, 404M), `@types/react@19.3.0`, `@types/react-dom@19.3.0` (2026-09-09). Runtime deps for the web only: `react@19.3.1`, `react-dom@19.3.1` (2026-10-14, 166M / 156M). Run `npm i <all>@<ver> --package-lock-only --dry-run` once, report the transitive count, wait for approval, then install with `--save-exact`.

- [ ] **Step 2: Write config**

`package.json`: `"type": "module"`, `"private": true`, scripts `dev: vite`, `build: tsc --noEmit && vite build`, `test: vitest run`, `lint: eslint .`, `format: prettier --write .`, `format:check: prettier --check .`, `cli: node src/cli/main.ts`. `engines.node >= 22.18`.

`tsconfig.json`: `strict`, `target es2022`, `module esnext`, `moduleResolution bundler`, `lib ["es2022","dom","dom.iterable"]`, `jsx react-jsx`, `noEmit`, `allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `types ["node"]`, `include ["src"]`. Imports use explicit `.ts` / `.tsx` extensions so Node runs the CLI without a build.

`eslint.config.js`: flat config, `typescript-eslint` recommended, `eslint-plugin-react-hooks` recommended on `src/web/**`, `eslint-config-prettier` last, and for `src/core/**` (excluding `src/core/**/*.test.ts`) a `no-restricted-imports` rule with patterns `node:*`, `../cli/*`, `../web/*`, `../test/*`. Test files may import anything.

`.prettierrc`: `{ "semi": false, "singleQuote": true, "printWidth": 100 }` (my call, change to taste).

`vitest.config.ts`: `test.include = ['src/**/*.test.ts']`.

`README.md`: one-paragraph purpose, usage placeholder, and the Prior art list from the spec verbatim (GBX.NET, gbx-ts, TMX Replay Investigation, TM2020-TAS, Wirtual video).

- [ ] **Step 3: Write the smoke test**

`src/core/smoke.test.ts`: `test('vitest runs', () => expect(1 + 1).toBe(2))`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run format:check`
Expected: 1 test passed, no lint errors, prettier clean.

- [ ] **Step 5: Commit on main, then branch**

```bash
git add -A && git commit -m "chore: scaffold vite react ts project with fixtures"
git checkout -b feat/core-parser
```

### Task 2: ByteReader

**Files:**

- Create: `src/core/io/byte-reader.ts`, `src/core/io/byte-reader.test.ts`

**Interfaces:**

- Produces: `class ByteReader { constructor(bytes: Uint8Array, offset = 0); pos: number; readonly length: number; remaining(): number; u8(): number; u16(): number; u32(): number; i32(): number; i64(): bigint; f32(): number; bytes(n: number): Uint8Array; data(): Uint8Array; string(): string; bool(): boolean; timeint(): number | null; skip(n: number): void; peekU32(): number }`, and `class ParseError extends Error { constructor(message: string, offset: number) }` in `src/core/io/errors.ts`

- [ ] **Step 1: Write failing tests**

`test('reads little-endian u32 and i32')` on `[0x78,0x56,0x34,0x12]` -> `0x12345678`; `test('timeint -1 is null')`; `test('string is i32 length + utf8')` on bytes for `"héllo"`; `test('reading past end throws ParseError with offset')`; `test('peekU32 does not advance')`.

- [ ] **Step 2: Run, verify fail** `npx vitest run src/core/io` -> module not found.
- [ ] **Step 3: Implement** on a `DataView`, `TextDecoder('utf-8')`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: byte reader`

### Task 3: Gbx header and reference table

**Files:**

- Create: `src/core/gbx/header.ts`, `src/core/gbx/header.test.ts`, `src/test/fixtures.ts` (test helper reading `fixtures/*` with `node:fs`, imported only from test files)

**Interfaces:**

- Produces: `interface GbxHeader { version: number; format: 'B' | 'T'; refTableCompressed: boolean; bodyCompressed: boolean; classId: number; headerChunks: { id: number; heavy: boolean; data: Uint8Array }[]; numNodes: number; bodyOffset: number }`; `function parseHeader(bytes: Uint8Array): GbxHeader`; `class UnsupportedError extends Error`
- Produces: `FIXTURES = { slidrz: 'Slidrz_(00_24_794)_symmetrical-spring-2025-03.Ghost.Gbx', tmio: '2f3e488b-31d7-48b3-bc91-7a255b5484cc.Ghost.gbx' }` and `loadFixture(name): Uint8Array`

- [ ] **Step 1: Write failing tests**

`test('slidrz header')`: version 6, format `B`, bodyCompressed true, classId `0x03092000`, headerChunks `[]`, numNodes 2, bodyOffset 33. `test('tmio header')`: same classId, bodyOffset 33. `test('bad magic throws ParseError')`. `test('external refs throw UnsupportedError')` on a hand-built header with numExternalNodes 1. `test('header chunk table')` on a hand-built header with one chunk of 4 bytes and heavy flag set: `headerChunks[0].heavy === true`, `data.length === 4`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement `parseHeader`** per Format reference. Text format (`T`) throws `UnsupportedError`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: gbx header parser`

### Task 4: LZO1X decoder

**Files:**

- Create: `src/core/gbx/lzo1x.ts`, `src/core/gbx/lzo1x.test.ts`

**Interfaces:**

- Produces: `function lzo1xDecompress(src: Uint8Array, dstSize: number): Uint8Array` throwing `ParseError` on malformed input, on early end, or when the end marker arrives before `dstSize` bytes are written

- [ ] **Step 1: Write failing tests**

`test('literal-only stream')`: hand-built `[17 + 5, a, b, c, d, e, 0x11, 0, 0]` -> `abcde` (M4 with off 0 is the end marker). `test('overlapping match copy')`: literal `ab` then M2 copying 4 bytes at offset 2 -> `ababab`. `test('slidrz body decompresses to header size')`: slice from bodyOffset + 8, `dstSize = 32809`, result length 32809, `result[0..4] == [0x06,0xf0,0x03,0x03]`, contains bytes `50 49 4b 53`. `test('tmio body decompresses')` likewise (sizes from its header words at offset 33 and 37). `test('truncated stream throws ParseError')`: slidrz body cut to half. `test('wrong dstSize throws')`: dstSize + 1.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** per the LZO1X block in Format reference.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: lzo1x decoder`

### Task 5: Lookback ids, ident, packdesc

**Files:**

- Create: `src/core/gbx/ids.ts`, `src/core/gbx/ids.test.ts`

**Interfaces:**

- Produces: `class IdState { version: number | null; seen: string[] }`; `function readId(r: ByteReader, s: IdState): string`; `interface Ident { id: string; collection: string; author: string }`; `function readIdent(r, s): Ident`; `interface PackDesc { filePath: string; locatorUrl: string; checksum: Uint8Array | null }`; `function readPackDesc(r): PackDesc`

- [ ] **Step 1: Write failing tests**

`test('first id reads version then new string')`: bytes `[3,0,0,0, 0,0,0,0x40, 3,0,0,0, 'a','b','c']` -> `'abc'`, `seen = ['abc']`. `test('reference by index')`: next `[1,0,0,0x40]` -> `'abc'`. `test('null id')`: `[0xff,0xff,0xff,0xff]` -> `''`. `test('numeric id')`: `[26,0,0,0]` -> `'26'`. `test('version below 3 throws')`. `test('packdesc v3 reads checksum and both strings')`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: lookback ids, ident, packdesc`

### Task 6: Chunk walker and node references

**Files:**

- Create: `src/core/gbx/node.ts`, `src/core/gbx/node.test.ts`, `src/core/gbx/errors.ts`

**Interfaces:**

- Produces:

  ```ts
  interface ReadContext {
    r: ByteReader
    ids: IdState
    nodes: Map<number, unknown>
    registry: ClassRegistry
  }
  type Inflate = (
    compressed: Uint8Array,
    uncompressedSize: number,
  ) => Uint8Array | Promise<Uint8Array> // in src/core/model.ts, used by Task 10 onward, never by chunk readers
  type ChunkReader<T> = (ctx: ReadContext, node: T, payload?: ByteReader) => void // payload set for skippable chunks
  interface ClassDef<T> {
    classId: number
    create(): T
    chunks: Map<number, ChunkReader<T>>
    onUnknownSkippable?(node: T, chunkId: number, data: Uint8Array): void
  }
  type ClassRegistry = Map<number, ClassDef<unknown>>
  function readNode<T>(ctx: ReadContext, classId: number): T
  function readNodeRef<T>(ctx: ReadContext): T | null
  class UnknownChunkError extends ParseError {
    classId: number
    chunkId: number
  }
  ```

  A class that wants unknown skippable payloads keeps them itself in `onUnknownSkippable` (the ghost does, Task 8)

- [ ] **Step 1: Write failing tests**

With a test ClassDef `0x0AAA0000` whose chunk `0x0AAA0001` reads one i32 into `node.a`: `test('reads known chunk then end marker')`; `test('skips unknown skippable chunk via PIKS')` -> `onUnknownSkippable` called with id `0x0AAA0002` and 4 bytes; `test('unknown non-skippable throws UnknownChunkError')` with both ids in the message; `test('known skippable chunk gets a bounded payload reader')` that is positioned after the payload regardless of how much the reader consumed; `test('node ref -1 is null, repeated index returns same object, new index reads class id and body')`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** per Format reference. After a skippable chunk reader returns, set `r.pos` to payload end. For a non-skippable unknown chunk, throw before consuming anything past the id.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: chunk walker and node refs`

### Task 7: CPlugEntRecordData container

**Files:**

- Create: `src/core/gbx/classes/ent-record-data.ts`, `src/core/gbx/classes/ent-record-data.test.ts`

**Interfaces:**

- Produces: `interface EntRecordData { version: number; uncompressedSize: number; compressed: Uint8Array }`; `const EntRecordDataDef: ClassDef<EntRecordData>` (classId `0x0911F000`, chunk `0x0911F000`)

- [ ] **Step 1: Write failing test** with a hand-built node body: `[00 F0 11 09] [05 00 00 00] [uncompressedSize 10] [data len 3: 1 2 3] [01 DE CA FA]` -> `{ version: 5, uncompressedSize: 10, compressed: [1,2,3] }`. `test('version < 5 throws UnsupportedError')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: ent record data container`

### Task 8: Ghost class readers and model

**Files:**

- Create: `src/core/model.ts`, `src/core/gbx/classes/ghost.ts`, `src/core/gbx/classes/ghost.test.ts`, `src/core/gbx/registry.ts`

**Interfaces:**

- Produces in `model.ts`:
  ```ts
  interface Checkpoint {
    timeMs: number
    stuntsScore: number | null
  }
  interface PlayerInputData {
    version: number
    u01: number
    startOffsetMs: number | null
    ticks: number
    data: Uint8Array
  }
  interface WallTime {
    startUnixSec: number
    endUnixSec: number
    source: '02C' | '02D'
  }
  interface Validation {
    exeVersion: string
    exeChecksum: number
    osKind: number
    cpuKind: number
    titleId: string
    validationSeed: number
    raceSettings: string
  }
  interface Ghost {
    nickname: string
    login: string
    zone: string | null
    clubTag: string | null
    trigram: string | null
    recordingContext: string | null
    playerModel: Ident
    mapUid: string
    ghostUid: string
    raceTimeMs: number | null
    respawns: number | null
    checkpoints: Checkpoint[]
    ghostVersion: number | null
    inputs: PlayerInputData[]
    wallTime: WallTime | null
    validation: Validation | null
    recordData: EntRecordData | null
    rawChunks: Map<number, Uint8Array>
    unknownChunks: number[]
  }
  ```
- Produces: `const GhostDef: ClassDef<Ghost>` with every chunk in the Format reference table plus `0x0303F006` / `0x0303F007`; `function createRegistry(): ClassRegistry` registering `GhostDef`, `EntRecordDataDef`, and (Task 11) `ReplayDef`
- Consumes: Tasks 2 to 7

- [ ] **Step 1: Write failing tests**

Helper `parseGhostFixture(name)`: header -> lzo -> `readNode(ctx, 0x03092000)`. For `slidrz`: `raceTimeMs === 24794`, `login.length > 0`, `mapUid.length === 27`, `checkpoints.length > 0`, `checkpoints.at(-1).timeMs === 24794`, `respawns !== null`, `inputs.length === 1`, `inputs[0].version === 12`, `inputs[0].ticks > 2000`, `recordData !== null`, `unknownChunks` does not contain any id in the table, `wallTime` is non-null and `endUnixSec - startUnixSec` is within `[24, 60]`. For `tmio`: parses, `raceTimeMs > 0`, `checkpoints.at(-1).timeMs === raceTimeMs`. `test('ghost without input chunk still parses')`: re-serialize is out of scope, so build a minimal ghost body by hand with chunks `0x0303F006`, `0x03092000` (version 0, minimal), `0x0309200C`, `0x0309200E`, `0x0309200F`, `0x03092010`, `0x0309201C`, end marker -> `inputs` empty, `raceTimeMs` null.

If the wall time assertion fails because neither `02C` nor `02D` is present, change that test to assert `wallTime === null`, note the finding in the commit body, and flag it in the phase summary (the `wall_time_ratio` signal then has no data on online records).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `GhostDef`. `0x000` chunk per table; `0x02D` stops reading after `u01` when `u01 >= 1` (fields stay null). Unknown skippable chunks go to `rawChunks` and `unknownChunks`; `0x022` and `0x023` go to `rawChunks` only.
- [ ] **Step 4: Run, verify pass.** If `0x000` fails mid-way, print `version` and `appearanceVersion` and compare the byte sequence against the table before changing the reader.
- [ ] **Step 5: Commit** `feat: ghost chunk readers`

### Task 9: Input bit decoder

**Files:**

- Create: `src/core/io/bit-reader.ts`, `src/core/io/bit-reader.test.ts`, `src/core/inputs/decode.ts`, `src/core/inputs/decode.test.ts`

**Interfaces:**

- Produces: `class BitReader { constructor(bytes: Uint8Array); bit(): 0 | 1; read(n: number): bigint; readU16(): number; readI8(): number; bitPos: number; bitsLeft(): number }`
- Produces in `model.ts`: `type InputKind = 'steer' | 'gas' | 'brake' | 'horn' | 'jump' | 'freeLook' | 'actionSlot' | 'respawn' | 'secondaryRespawn' | 'mouse'`; `interface InputEvent { tick: number; timeMs: number; kind: InputKind; value: number; value2?: number }` (steer -127..127; binary 0/1; actionSlot = slot number with value2 = 0/1 pressed; mouse value = x, value2 = y; respawn kinds value 1)
- Produces: `function decodeInputs(d: PlayerInputData): InputEvent[]` and `function steerSeries(events: InputEvent[], ticks: number): Int8Array` (per-tick steer, forward-filled, 0 before the first steer event)

- [ ] **Step 1: Write failing tests**

BitReader: `test('bits are LSB-first')` on `[0b00000101]` -> `1,0,1,0`; `test('read(10) across bytes assembles first bit into bit 0')`; `test('readI8 two's complement')` on byte `0x81` -> `-127`; `test('readU16 is little-endian when byte-aligned')`.

decode: `test('vehicle start then steer and gas')` on a hand-built bitstream: tick 0 full state with kind 2 (34 bits, value 2), no mouse change, vehicle change with steer 100, gas 1, brake 0; tick 1 unchanged flags (1,1,1) -> events `[{tick:0,kind:'steer',value:100},{tick:0,kind:'gas',value:1}]`, `timeMs` 0 and 0 with `startOffsetMs: null`. `test('startOffset shifts timeMs')`. `test('action slot press and release on consecutive ticks')` via two full-state words differing in bit 14 -> `actionSlot` events with value 1, value2 1 then 0. `test('trailing nonzero bytes throw ParseError')`. `test('slidrz decodes')`: no throw, at least 100 steer events, every steer in `[-127, 127]`, ticks match `inputs[0].ticks`, `steerSeries(...).length === ticks`. `test('tmio decodes')` likewise.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** per the input block in Format reference. Emit on change only.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: tm2020 input bit decoder`

### Task 10: Sample decoder (positions)

**Files:**

- Create: `src/core/samples/decode.ts`, `src/core/samples/decode.test.ts`, `src/cli/inflate.ts` (`inflateNode: Inflate` on `node:zlib` `inflateSync`)

**Interfaces:**

- Produces in `model.ts`: `interface Sample { timeMs: number; position: [number, number, number]; speedMs: number }`
- Produces: `async function decodeSamples(data: EntRecordData, inflate: Inflate): Promise<Sample[]>` (vehicle entity only; empty array when no vehicle entity)
- Produces: `inflateNode` in `src/cli/inflate.ts`; core tests that need inflation import `node:zlib` directly

- [ ] **Step 1: Write failing tests**

`test('columnar delta decoding')` on a hand-built decompressed body with version 11, one EntRecordDesc with classId `0x0A018000`, one entity, 3 samples, sampleSize 103, position bytes placed at offset 47 with column deltas chosen so sample 2 decodes to `(1, 2, 3)`; pass `inflate = (b) => b` (identity) with `compressed` = that body. `test('slidrz samples')`: `samples.length > 200`, times strictly increasing, `samples.at(-1).timeMs` within 1500 ms of `raceTimeMs`, every coordinate finite with `|x| < 4096`, `|z| < 4096`, `-100 < y < 1024`, `speedMs` within `[0, 400]`. `test('no vehicle entity gives empty array')`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** per the CPlugEntRecordData block. Stop after entList.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: ghost sample decoder`

### Task 11: Replay.Gbx support and parse entry

**Files:**

- Create: `src/core/gbx/classes/replay.ts`, `src/core/parse.ts`, `src/core/parse.test.ts`
- Modify: `src/core/gbx/registry.ts`, `src/core/model.ts`

**Interfaces:**

- Produces in `model.ts`: `interface ReplayHeader { version: number; mapInfo: Ident; timeMs: number | null; nickname: string; login: string | null; titleId: string | null }`; `interface ParsedFile { kind: 'ghost' | 'replay'; ghosts: Ghost[]; replay: ReplayHeader | null; warnings: string[] }`
- Produces: `function parseGbx(bytes: Uint8Array, inflate: Inflate): ParsedFile`
- Consumes: `parseHeader`, `lzo1xDecompress`, `readNode`, `GhostDef`

- [ ] **Step 1: Replay fixtures**

Two sources, use both when available: (a) a replay the user saves from the current game build, dropped into `fixtures/` as `local-<yyyy-mm-dd>.Replay.Gbx` (current wall time chunk layout); (b) `fixtures/tmx-151406.Replay.Gbx` (already in the repo since Task 1: TMX replay 151406, map 1, SkiFreak, uploaded 2024-01-09, older game build). Verified header: classId `0x03093000`, user data 735 bytes with three header chunks `0x03093000` (144 bytes, version 8), `0x03093001` (463 bytes, heavy flag set), `0x03093002` (100 bytes); the first ident in the header chunk starts with the lookback id version `3`, then a new-string map uid of 27 chars. The replay fixture tests below run against every `fixtures/*.Replay.Gbx` present; the race time assertion `78321` applies only to the TMX one.

- [ ] **Step 2: Write failing tests**

`test('slidrz parses as ghost')`: `kind === 'ghost'`, `ghosts.length === 1`, `replay === null`. `test('tmio parses as ghost')`. `test('replay fixture parses')`: `kind === 'replay'`, `replay.mapInfo.id.length === 27`, `ghosts.length >= 1`, `ghosts[0].raceTimeMs === 78321` (ReplayTime from the TMX listing). `test('replay with clip still returns ghosts and a warning')`: hand-built replay body with `0x03093002` (4-byte data), `0x03093014` (one inline ghost node, the minimal ghost from Task 8, then i32 0, empty i64 list), then `0x03093015` with index 5 and nothing after -> `ghosts.length === 1`, `warnings` contains a string mentioning `0x03093015`. `test('unknown class id throws UnsupportedError')`.

- [ ] **Step 3: Run, verify fail.**
- [ ] **Step 4: Implement** `ReplayDef` reading header chunk `0x03093000` from `GbxHeader.headerChunks`, body `0x002` and `0x014`, then stop walking (do not read `0x015` or beyond, push the warning `'stopped before 0x03093015'` only if more bytes remain). `parseGbx` dispatches on `classId`.
- [ ] **Step 5: Run, verify pass.** If the replay's first body id fails, apply the retry noted under Lookback ids and record which variant worked in a comment on `IdState`.
- [ ] **Step 6: Commit** `feat: replay parsing and parse entry`

### Task 12: CLI skeleton and `dump`

**Files:**

- Create: `src/cli/main.ts`, `src/cli/args.ts`, `src/cli/dump.ts`, `src/cli/dump.test.ts`, `src/cli/io.ts` (`readFileBytes(path)`, `writeJson(path, value)`)
- Create: `fixtures/<name>.dump.json` golden files (generated in Step 4)

**Interfaces:**

- Produces: `node src/cli/main.ts dump <file> [--json] [--events N]`; `async function dumpFile(bytes: Uint8Array, opts: { events: number }): Promise<DumpResult>` in `src/cli/dump.ts` where `DumpResult = { file: ParsedFile with Uint8Array fields replaced by { length, sha256 }, inputs: { ticks, startOffsetMs, eventCount, firstEvents: InputEvent[] }[], samples: { count, firstTimeMs, lastTimeMs } | null, unknownChunks: string[] (hex) }`
- Produces: `parseArgs` wrapper over `node:util` `parseArgs` returning `{ command, positionals, flags }`

- [ ] **Step 1: Write failing tests**

`test('dump slidrz json has race time and chunk list')`: `dumpFile(loadFixture('slidrz'), { events: 5 })` -> `file.ghosts[0].raceTimeMs === 24794`, `inputs[0].firstEvents.length === 5`, `unknownChunks` is an array of `0x`-prefixed strings. `test('cli dump exits 0 and prints JSON')`: `execFileSync('node', ['src/cli/main.ts', 'dump', path, '--json'])` parses as JSON. `test('golden dumps match')`: for each fixture, `dumpFile(...)` deep-equals `fixtures/<name>.dump.json`.

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Text mode prints a tree: header fields, each ghost's scalar fields, checkpoint table, chunk ids seen with sizes, first N input events, sample count.
- [ ] **Step 4: Generate goldens** `node src/cli/main.ts dump fixtures/<f> --json --events 20 > fixtures/<name>.dump.json` for each fixture, eyeball them once (race time, login, ticks vs race time, wall time presence), record `ticks * 10 + startOffset` vs `raceTimeMs` for both fixtures in the commit body.
- [ ] **Step 5: Run, verify pass.**
- [ ] **Step 6: Commit** `feat: cli dump with golden fixtures`

### Task 13: CLI `fetch` and TMX client

**Files:**

- Create: `src/cli/tmx.ts`, `src/cli/tmx.test.ts`, `src/cli/fetch.ts`

**Interfaces:**

- Produces:
  ```ts
  interface TmxClient {
    searchMaps(
      name: string,
      count?: number,
    ): Promise<{ MapId: number; Name: string; MapUid: string }[]>
    listOnlineRecords(mapId: number, count?: number): Promise<OnlineRecord[]>
    listReplays(mapId: number, count?: number): Promise<ReplayListing[]>
    downloadOnlineRecord(recordId: string): Promise<{ filename: string; bytes: Uint8Array }>
    downloadReplay(replayId: number): Promise<{ filename: string; bytes: Uint8Array }>
  }
  function createTmxClient(fetchFn: typeof fetch, userAgent: string): TmxClient
  ```
  `OnlineRecord = { Position, RecordTime, DisplayName, AccountId, RecordId, RecordAt }`, `ReplayListing = { ReplayId, ReplayTime, ReplayAt, Position, IsBest, HasFile, User: { Name } }`
- Produces: `node src/cli/main.ts fetch (--map <id> [--count N] [--uploads] | --ghost <uuid> | --search <name>) --out <dir>`; filename taken from `Content-Disposition`, sanitized to `[A-Za-z0-9._()-]`, every ghost also written as `<RecordId>.Ghost.Gbx` when the header lacks a filename. `--count` pages the `/api/replays` listing via `More` (online records are not paged by the endpoint; cap 100). 250 ms delay between downloads. User-Agent `tm2020-tracker/0.1 (+https://github.com/<owner>/tm2020-tracker)`.
- Produces: sidecar `<out>/index.json` merged on every run: `{ [filename]: { recordId: string | null; replayId: number | null; position: number; mapId: number; recordTimeMs: number } }`, consumed by Task 19

- [ ] **Step 1: Write failing tests** with a stub `fetchFn` recording URLs and returning canned JSON/bytes: `test('searchMaps builds the url with fields and sends user-agent')`; `test('listReplays follows More until count reached')`; `test('downloadOnlineRecord uses content-disposition filename')`; `test('non-200 rejects with status and url')`; `test('fetch writes and merges index.json')` with an in-memory file sink.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.** Then one real run, gated: `node src/cli/main.ts fetch --search "Spring 2025 - 03"` (JSON only, no files) and confirm it prints map ids.
- [ ] **Step 5: Commit** `feat: cli fetch for tmx records and replays`

- [ ] **Phase A stop:** `npm test && npm run lint && npm run format:check`, then print branch, commit subjects, files changed. Wait for `push` / `push and merge` (squash to main).

---

## Phase B: signals and `analyze` (branch `feat/signals` off `main` after Phase A merge)

### Task 14: Signal framework, constants, file context

**Files:**

- Create: `src/core/signals/types.ts`, `src/core/signals/constants.ts`, `src/core/signals/context.ts`, `src/core/signals/context.test.ts`, `src/core/signals/index.ts`

**Interfaces:**

- Produces in `types.ts`:
  ```ts
  type SignalId =
    | 'wall_time_ratio'
    | 'ticks_vs_racetime'
    | 'same_tick_toggle'
    | 'steer_spikes_per_sec'
    | 'input_density'
    | 'steer_device'
    | 'steer_repetition'
    | 'trajectory_overlap'
    | 'checkpoint_split_match'
    | 'metadata'
  type SignalLevel = 'absolute' | 'relative' | 'info'
  type Device = 'keyboard' | 'pad' | 'mixed' | 'unknown'
  interface Reference {
    source: '2021' | 'baseline'
    label: string
    low: number | null
    high: number | null
  }
  interface SignalResult {
    id: SignalId
    level: SignalLevel
    applicable: boolean
    fired: boolean
    value: number | null
    unit: string
    evidence: string[]
    references: Reference[]
  }
  interface FileContext {
    name: string
    parsed: ParsedFile
    ghost: Ghost
    events: InputEvent[]
    steer: Int8Array | null
    samples: Sample[] | null
    device: Device
  }
  type Detector = (ctx: FileContext, baseline: Baseline | null) => SignalResult
  interface Summary {
    absoluteFired: SignalId[]
    relativeOutside: SignalId[]
    needsHumanReview: boolean
  }
  interface FileReport {
    name: string
    login: string
    mapUid: string
    raceTimeMs: number | null
    device: Device
    signals: SignalResult[]
    summary: Summary
  }
  interface MapGroup {
    mapUid: string
    files: string[]
    signals: (SignalResult & { pair: [string, string] })[]
  }
  interface LoginGroup {
    login: string
    files: string[]
    wallTimeRatio: { n: number; mean: number; min: number; max: number } | null
  }
  interface Report {
    generatedAt: string
    files: FileReport[]
    groups: { byMap: MapGroup[]; byLogin: LoginGroup[] }
  }
  ```
  `Baseline` type comes from Task 20; declare it in `types.ts` now:
  `interface Baseline { builtAt: string; files: number; ranks: [number, number]; chunkPresence: Record<string, number>; signals: Partial<Record<SignalId, Partial<Record<Device, { n: number; median: number; q1: number; q3: number }>>>> }`
- Produces in `constants.ts` (all exported, each with a one-line comment naming its source): `TICK_MS = 10`, `TICKS_TOLERANCE = 2`, `STEER_SPIKE_MIN_DELTA = 4`, `SPIKE_WINDOW_MS = 1000`, `SAME_TICK_MAX_GAP_TICKS = 1`, `SAME_TICK_MIN_COUNT = 3`, `REPEAT_MIN_LEN_TICKS = 50`, `KEYBOARD_STEER_VALUES = [-127, 0, 127]`, `PAD_MIN_DISTINCT_STEER = 16`, `TRAJECTORY_EPS_M = 0.1`, `TRAJECTORY_MIN_WINDOW_MS = 2000`, `TRAJECTORY_SKIP_START_MS = 1000`, `WALL_TIME_RESOLUTION_S = 1`, `TUKEY_K = 1.5`, `REF_2021 = { avgSpikesPerSec: 3, avgMaxSpikesPerSec: 6 }`, `BASELINE_RANKS: [10, 50]`
- Produces: `async function buildContext(name: string, parsed: ParsedFile, inflate: Inflate): Promise<FileContext>` (first ghost; `events = []`, `steer = null` when no inputs; `samples = null` when no record data; `device` via `detectDevice(steer)`), `function detectDevice(steer: Int8Array | null): Device`
- Produces in `index.ts`: `const DETECTORS: Detector[]` (filled by Tasks 15 to 17), `function analyzeFile(ctx, baseline): FileReport`, `function summarize(signals): Summary` (`needsHumanReview = absoluteFired.length > 0 || relativeOutside.length >= 2`), `function analyzeFiles(ctxs: FileContext[], baseline): Report` (groups filled in Task 18, empty until then)

- [ ] **Step 1: Write failing tests** `test('detectDevice keyboard')` on series of only -127/0/127; `test('pad')` on 40 distinct values; `test('mixed')` on 5 distinct values; `test('unknown on null')`; `test('buildContext slidrz has events, steer, samples')`; `test('summarize rules')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: signal framework and constants`

### Task 15: Time and metadata signals

**Files:**

- Create: `src/core/signals/wall-time.ts`, `src/core/signals/ticks-vs-racetime.ts`, `src/core/signals/metadata.ts`, `src/core/signals/time.test.ts`
- Modify: `src/core/signals/index.ts` (register)

**Interfaces:**

- Produces: `wallTimeRatio: Detector`, `ticksVsRaceTime: Detector`, `metadata: Detector`
- `wall_time_ratio`: `value = (end - start) / (raceTimeMs / 1000)`; `applicable` only with wallTime and raceTime; evidence `wall <n> s (+-1 s), race <t> s`; `fired` only with baseline and value outside Tukey fence `[q1 - k*IQR, q3 + k*IQR]` for the device; references: baseline range when present
- `ticks_vs_racetime`: `value = ticks * TICK_MS + (startOffsetMs ?? 0) - raceTimeMs` in ms; `fired = |value| > TICKS_TOLERANCE * TICK_MS`; level `absolute`. Step 3 below decides if the fixtures contradict this
- `metadata`: `info`, never fires, evidence lines: login, nickname, zone, club tag, recording context, ghost version, exe version / os / cpu / title id / race settings when validation present, `0x022` and `0x023` sizes and first 16 bytes hex

- [ ] **Step 1: Write failing tests** with hand-built `FileContext` objects (helper `fakeCtx(overrides)` in `src/core/signals/test-util.ts`): `test('wall time ratio 30/25 = 1.2 and not fired without baseline')`; `test('fires with baseline when outside fence')` using baseline `{ median 1.02, q1 1.0, q3 1.05 }`; `test('not applicable without wall time')`; `test('ticks mismatch of 5 ticks fires')`; `test('ticks within 2 ticks does not fire')`; `test('metadata lists exe version when present')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Then run `analyzeFile` on both fixtures: if `ticks_vs_racetime` fires on either clean fixture, change its level to `info`, set `fired = false` always, and record the observed offsets in a comment above `TICKS_TOLERANCE`.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: wall time, tick count and metadata signals`

### Task 16: Input pattern signals

**Files:**

- Create: `src/core/signals/same-tick-toggle.ts`, `src/core/signals/steer-device.ts`, `src/core/signals/input-density.ts`, `src/core/signals/steer-spikes.ts`, `src/core/signals/steer-repetition.ts`, `src/core/signals/inputs.test.ts`
- Modify: `src/core/signals/index.ts`

**Interfaces:**

- `same_tick_toggle` (absolute): for kinds gas, brake, horn, jump, freeLook, actionSlot (per slot): a press followed by a release within `SAME_TICK_MAX_GAP_TICKS` ticks counts once; `value = count`; `fired = count >= SAME_TICK_MIN_COUNT`; evidence: first 10 occurrences as `t=<ms> <kind>`
- `steer_device` (info): `value = null`, evidence `device: <device>, distinct steer values: <n>`
- `input_density` (relative): `value = events.length / raceSec`; evidence splits steer vs binary per second; fires only with baseline, Tukey fence
- `steer_spikes_per_sec` (relative): on the per-tick `steer` series: `d[t] = steer[t] - steer[t-1]`, keep only `|d[t]| >= STEER_SPIKE_MIN_DELTA`; a spike is a kept delta whose sign differs from the previous kept delta; count spikes per `SPIKE_WINDOW_MS` window of ticks; `value = mean over windows`; evidence includes `max window: <n>`; references: `REF_2021` avg and avg-max, baseline when present; fires only with baseline
- `steer_repetition` (relative, pad only): `applicable = device === 'pad'`; `value = longest length L >= REPEAT_MIN_LEN_TICKS such that some window of L ticks appears twice non-overlapping in the steer series` (binary search on L with a rolling hash set, confirm candidates by direct compare); evidence gives both start ticks; fires only with baseline
- Produces: all five as `Detector`

- [ ] **Step 1: Write failing tests** with `fakeCtx`: `test('toggle within one tick counts')` events gas 1 at tick 10, gas 0 at tick 11 -> count 1, not fired (below min count); `test('three toggles fire')`; `test('spikes: alternating +-50 every tick gives 100 per window')` on a 300-tick series; `test('spikes ignore deltas below threshold')`; `test('keyboard makes steer_repetition not applicable and not fired')` (Review Focus 5); `test('pad series with an exact 80-tick repeat reports 80')`; `test('pad series without repeat reports 0')`; `test('input density counts events per race second')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: input pattern and steer signals`

### Task 17: `analyze` CLI (single and multi-file) and no-inputs path

**Files:**

- Create: `src/cli/analyze.ts`, `src/cli/analyze.test.ts`, `src/cli/format-report.ts`
- Modify: `src/cli/main.ts`

**Interfaces:**

- Produces: `node src/cli/main.ts analyze <file|dir>... [--json] [--baseline <file>]`; `function formatReport(report: Report): string` (text table per file: signal id, level, value, fired, first evidence line; then summary; then groups)
- Consumes: `analyzeFiles`, `buildContext`, `parseGbx`, `inflateNode` from `src/cli/inflate.ts`

- [ ] **Step 1: Write failing tests** `test('analyze slidrz returns one file report with all 10 signal ids')` (multi-file ones present with `applicable: false` on single file); `test('output never contains the word cheat')` on `JSON.stringify(report)` and `formatReport(report)`, case-insensitive; `test('ghost without inputs reports input signals as not applicable')` (Review Focus 1) using the minimal hand-built ghost from Task 8 through `parseGbx`; `test('cli analyze --json exits 0')` via `execFileSync` on both fixtures at once.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Directory arguments expand to `*.Gbx` / `*.gbx` (case-insensitive) non-recursively. Parse errors on one file become a `FileReport` with a single `metadata` signal whose evidence is the error message, exit code stays 0 unless every file failed.
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: cli analyze`

### Task 18: Multi-file signals and grouping

**Files:**

- Create: `src/core/signals/trajectory-overlap.ts`, `src/core/signals/checkpoint-split-match.ts`, `src/core/signals/groups.ts`, `src/core/signals/groups.test.ts`
- Modify: `src/core/signals/index.ts` (`analyzeFiles` fills `groups`)

**Interfaces:**

- Produces: `function trajectoryOverlap(a: FileContext, b: FileContext): SignalResult` (relative, map-scoped; resample both position series to 10 ms by linear interpolation over the common time range, skip the first `TRAJECTORY_SKIP_START_MS`, `value = longest run in ms where distance < TRAJECTORY_EPS_M`; `fired = value >= TRAJECTORY_MIN_WINDOW_MS`; `applicable` only when both have samples). Note: this one fires without a baseline, the window length is the reference
- Produces: `function checkpointSplitMatch(a, b): SignalResult` (info, login-scoped; `value = number of checkpoints with identical timeMs`; evidence lists them; never fires)
- Produces: `function buildGroups(ctxs: FileContext[], reports: FileReport[]): Report['groups']`: `byMap` pairs every two files sharing `mapUid` for `trajectory_overlap`, and only pairs sharing `mapUid` and `login` for `checkpoint_split_match`; `byLogin` aggregates `wall_time_ratio` values per login (`n`, `mean`, `min`, `max`, null when `n === 0`)

- [ ] **Step 1: Write failing tests** `test('identical sample series overlap for full length minus skip')`; `test('series offset by 0.5 m never overlap')`; `test('different logins on the same map get trajectory but not checkpoint pairing')` (Review Focus 4); `test('byLogin aggregates wall time across two files')`; `test('slidrz paired with itself fires trajectory_overlap')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: multi-file trajectory and split signals`

### Task 19: Baseline computation and reference points

**Files:**

- Create: `src/core/baseline.ts`, `src/core/baseline.test.ts`, `src/cli/baseline.ts`
- Modify: `src/cli/main.ts`, `src/core/signals/index.ts` (attach baseline references to relative signals)

**Interfaces:**

- Produces: `function computeBaseline(reports: FileReport[], meta: { ranks: [number, number]; chunkPresence: Record<string, number> }): Baseline` (per relative signal id and device: `n`, `median`, `q1`, `q3` over `value` of applicable results; devices with `n < 5` omitted)
- Produces: `function quantile(sorted: number[], q: number): number` (linear interpolation)
- Produces: `node src/cli/main.ts baseline <dir> --out baseline.json [--ranks 10:50]` where rank filtering uses `position` from Task 13's `<dir>/index.json`; files without a sidecar entry are included. The CLI computes `chunkPresence` as the share of files whose ghost has each of `0x0309201D`, `0x0309202C`, `0x0309202D`, `0x03092023`, keyed by hex id
- `analyze` with `--baseline`: every relative signal gets a `Reference { source: 'baseline', label: 'typical top records (ranks 10-50), <device>', low: q1, high: q3 }` and `fired` per Tukey fence

- [ ] **Step 1: Write failing tests** `test('quantile interpolates')`; `test('computeBaseline groups by device and omits n < 5')`; `test('analyze with baseline attaches reference and fires outside fence')` using a synthetic baseline and `fakeCtx`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** `feat: baseline computation and reference ranges`

- [ ] **Phase B stop:** full `npm test && npm run lint && npm run format:check`, print the summary, wait for push instructions. Baseline data collection (gated downloads of ~50 records x N maps) is run by the user after merge with `fetch` + `baseline`; the resulting `baseline.json` is committed in Task 21.

---

## Phase C: web page (branch `feat/web`)

### Task 20: Web pipeline, browser inflate, worker

**Files:**

- Create: `src/web/inflate.ts` (`inflateWeb: Inflate` using `DecompressionStream('deflate')`, async), `src/web/pipeline.ts`, `src/web/pipeline.test.ts`, `src/web/worker.ts`, `src/web/worker-protocol.ts`

**Interfaces:**

- Produces: `async function analyzeBytes(files: { name: string; bytes: Uint8Array }[], baseline: Baseline | null, inflate: Inflate): Promise<Report>` in `pipeline.ts` (shared by CLI `analyze` after this task: refactor `src/cli/analyze.ts` to call it)
- Produces: worker messages `{ type: 'analyze'; files: { name; bytes: ArrayBuffer }[]; baseline: Baseline | null }` -> `{ type: 'report'; report: Report } | { type: 'error'; message: string }`

- [ ] **Step 1: Write failing tests** `test('inflateWeb inflates a zlib blob')` on `zlib.deflateSync` output from `node:zlib` in the test; `test('web pipeline report equals cli report for both fixtures')`: `analyzeBytes(..., inflateWeb)` deep-equals `analyzeBytes(..., inflateNode)` after deleting `generatedAt`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Refactor `src/cli/analyze.ts` onto `analyzeBytes`, CLI output unchanged.
- [ ] **Step 4: Run, verify pass**, including the Phase A and B suites.
- [ ] **Step 5: Commit** `feat: shared pipeline, browser inflate, worker`

### Task 21: Page UI

**Files:**

- Create: `index.html`, `vite.config.ts` (`base: '/tm2020-tracker/'`, `@vitejs/plugin-react`, worker format `es`), `src/web/main.tsx`, `src/web/App.tsx`, `src/web/components/DropZone.tsx`, `FileReportView.tsx`, `SignalCard.tsx`, `SteerTrace.tsx`, `InputTimeline.tsx`, `CheckpointTable.tsx`, `GroupsView.tsx`, `src/web/styles.css`, `public/baseline.json` (the committed baseline, or `null` placeholder `{}` until the user produces one)
- Create: `src/web/components/SteerTrace.test.ts` for the path-building helper only

**Interfaces:**

- Produces: `function steerPath(steer: Int8Array, width: number, height: number): string` (SVG path `d` attribute, one point per 10 ticks), `function inputLanes(events: InputEvent[], ticks: number): { kind: InputKind; segments: [number, number][] }[]`
- Page behavior: drop zone accepts multiple files, reads `ArrayBuffer`, posts to the worker, shows a card per file with summary line, device, race time, then signal cards (level badge, value + unit, references as "typical range a to b" and "2021 reference"), steer trace SVG, input timeline SVG, checkpoint table; groups section when any `byMap` pair exists. Copy rules from the spec: no "cheat", the review line reads `needs human review: yes/no`. A link `download from TMX` opens `https://trackmania.exchange/getonlinerecord/<uuid>` when the user pastes a uuid into a small input (no fetch attempted, CORS)
- Baseline is fetched from `import.meta.env.BASE_URL + 'baseline.json'`; a missing file, a fetch error, or JSON without a `signals` field means `null`
- URL mode decision (deferred by the spec to this milestone): manual download. The page never fetches TMX or trackmania.io; it links the user to the download and takes the file by drop

- [ ] **Step 1: Write failing tests** `test('steerPath emits one M and width/10 L commands')`; `test('inputLanes merges consecutive presses into segments')`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Inline SVG only, no chart library. Load the `dataviz` skill before writing the SVG components.
- [ ] **Step 4: Run, verify pass**, then `npm run build` succeeds and `npm run dev` serves the page.
- [ ] **Step 5: Manual acceptance (milestone 3 gate from the spec):** open the dev server, drop both fixtures, compare each signal value with `node src/cli/main.ts analyze fixtures --json`. Record "matches" or the differences in the commit body.
- [ ] **Step 6: Commit** `feat: analyzer web page`

### Task 22: GitHub Pages workflow and README

**Files:**

- Create: `.github/workflows/pages.yml`
- Modify: `README.md`

- [ ] **Step 1: Write the workflow**: on push to `main`, `actions/checkout@v4`, `actions/setup-node@v4` with node 22 and `cache: npm`, `npm ci`, `npm test`, `npm run build`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3` with `path: dist`, `actions/deploy-pages@v4`; permissions `pages: write`, `id-token: write`.
- [ ] **Step 2: README**: usage for `dump`, `fetch`, `analyze`, `baseline`, the signal table copied from the spec with the `cheat`-free wording, the "typical top records, not clean runs" caveat, Prior art section, and a one-line note that gbx-ts exists and was not used because of the GPL `lzo-ts` dependency.
- [ ] **Step 3: Verify** `npm run lint && npm run format:check && npm test`.
- [ ] **Step 4: Commit** `chore: pages deploy workflow and readme`
- [ ] **Phase C stop:** print the summary, wait for push instructions. Enabling Pages in the repo settings is a user step.
