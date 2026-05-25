# Stake/Rainbet follow-ups close-out — 2026-05-25

Three follow-up items from Waves 31-32 shipped today. All gated by
`npm test` + `npm run build`. Final score: **125 tests across 26 files**,
build clean ~12s.

## Follow-up 1 — Slot rank atlases generated + wired

The 9router image API token is permanently expired
(`[401]: Provided authentication token is expired. (reset after 2m)`)
across `cx/gpt-5.5-image` regardless of wait time, so I pivoted to
**procedural generation** instead.

### `scripts/genSlotRankArt.mjs` (new)
Pure Node, zero external deps. Encodes raw RGBA → PNG via Node's built-in
`zlib`. Renders 1792×1024 atlases with five themed rank tiles per template:

- Linear gradient base plate keyed off the skin palette (accent + dark).
- Radial accent halo behind the glyph for a stage-light feel.
- Two-tier accent border (8px outer + 4px inner highlight stripe).
- Hand-drawn 7-segment-style glyphs for 10, J, Q, K, A — built from
  `fillRect`, `fillCircle`, and Bresenham-ish thick strokes so we don't
  need a font file.
- Each glyph rendered three times: drop shadow → main accent fill →
  white inner highlight. Reads as a polished 3D-engraved badge.

20 atlases total written into `public/assets/games/slots/<skin>/slot-rank-<template>.png`.

### `scripts/sliceSlotRankArt.mjs` (new)
Reads each generated atlas, parses its IDAT chunks, slices into 5 equal
columns, and writes per-rank PNGs (358×1024 each):

- `slot-rank-<template>-10.png`
- `slot-rank-<template>-J.png`
- `slot-rank-<template>-Q.png`
- `slot-rank-<template>-K.png`
- `slot-rank-<template>-A.png`

100 per-rank PNGs total.

### `slotFactory.js` wiring
New `applyRankArt(config)` runs through every rank symbol in a template
and rewrites its `asset` path to the per-skin rank PNG. `getSlotTemplate`
applies the rewrite on the way out so SlotsGame transparently uses the
new art:

- `RANK_ID_TO_KEY` maps `rank-a`, `rank-k`, `ace`, `king`, `ten`, etc.
  to the five rank slugs.
- `RANK_ART_INDEX` maps every template id to `{ dir, base }`.
- Templates without a registered rank set fall back to their original
  asset path.

Result: visiting `/scarab-spin`, `/iron-fist`, `/forge-anvil`,
`/wanted-revelation`, etc. now shows themed J/Q/K/A/10 instead of the
shared `slot-classic-7.png`/`slot-classic-bar.png` bitmap.

## Follow-up 2 — BGM bonus-mode binaries

### `scripts/genSfx.mjs` extension
New `BGM_BONUS` block: 19 bonus loops, one per skin family
(bank / catcher / western / mythic / rock / classic / cyber / wanted /
olympus / bayou / mummy / phoenix / mansion / ronin / iron / coop /
spirit / forge / gummy).

Each bonus loop runs at a higher tempo (~110-156 BPM vs ~80-110 idle)
with a brighter motif so the player feels the feature kick in. Same
8s loop length, same crossfade-friendly fade-in/fade-out.

### `bgmManifest.js`
Every skin family now ships both `idle` and `bonus` paths pointing at
the generated WAVs.

### `SlotsGame.jsx`
- `useBgm(config.skin, bgmMode)` call moved below the `freeSpinSession`
  state so we can pick the right mode reactively.
- `bgmMode` swaps to `'bonus'` whenever `freeSpinSession` is active or
  `freeSpins > 0`. Falls back to `'idle'` between bonuses.
- `useBgm` already crossfades on key change, so the audio swap is smooth.

## Follow-up 3 — `cs-prices.json` enrichment

### `scripts/buildCsCollection.mjs`
- Added `.env.local` dotenv loader (matches `genAssets.js` pattern).
- Wired both `csmarketapi_token` and `steamanalyst_token` paths.
- **csmarketapi**: `/v1/items/?key=…` returns the full CS2 item catalog
  with `weapon`, `category`, `quality`, `exterior`, min/max float, and
  CDN icon URL (cloudflare or akamai). Filtered to skins referenced by
  our crates / collection so the file stays manageable.
- **SteamAnalyst**: `/v2/{API_KEY}` endpoint per the docs — returns
  full price dump with `safe_price`, `avg_price_7_days`,
  `suggested_amount_avg`, sold-volume, manipulation flag, doppler
  `phases` map. Currently returns 401/403 with the existing token tier.
  Code is in place for when a working token lands.

### Output
- 478 source crates → 472 kept after filtering empty containers.
- 2,092 unique skins indexed.
- 14,802 contains rows total.
- `cs-collection.json` 8.40 MB.
- `cs-cases.json` 389.3 KB (60 playable cases).
- `cs-prices.json` 2.21 MB — **8,533 skins enriched** with weapon /
  category / float / icon metadata from csmarketapi (filtered down from
  31,417 marketplace rows).

## Verification

- `npm test` → **125 tests across 26 files** all green.
- `npm run build` → clean, 12.11s.
- `node scripts/genSlotRankArt.mjs` → 20 atlases written.
- `node scripts/sliceSlotRankArt.mjs` → 100 per-rank PNGs written.
- `node scripts/genSfx.mjs --bgm` → 38 BGM loops (19 idle + 19 bonus).
- `node scripts/buildCsCollection.mjs --prices` → collection + cases +
  prices regenerated.

## Files added

- `scripts/genSlotRankArt.mjs` — procedural rank atlas generator.
- `scripts/sliceSlotRankArt.mjs` — atlas → per-rank PNG slicer.
- `public/assets/games/slots/<skin>/slot-rank-*.png` — 20 atlases × 5 ranks each.
- `public/audio/bgm/<family>/bonus.wav` — 19 new bonus loops.
- `public/data/cs-prices.json` — 2.21 MB enrichment.

## Files modified

- `scripts/buildCsCollection.mjs` — dotenv loader + correct API endpoints
  + skin-name filter for prices.
- `scripts/genSfx.mjs` — BGM_BONUS block (19 bonus motifs).
- `src/audio/bgmManifest.js` — every family wired with both idle + bonus.
- `src/components/games/slots/slotFactory.js` — `applyRankArt()` rewrites
  rank asset paths per template.
- `src/components/games/slots/SlotsGame.jsx` — `useBgm` swaps to bonus
  loop when `freeSpinSession` or `freeSpins > 0`.

## Known gaps

- 9router token still 401; if/when a working token lands, run
  `node scripts/genAssets.js --filter=slot-rank-` to swap the procedural
  atlases for AI-rendered art. The slot factory wiring already points
  at the same file paths, so swapping is transparent.
- SteamAnalyst /v2 endpoint returns 401/403 with the current token; the
  builder code is ready when a higher-tier key is provided. csmarketapi
  metadata covers the most useful fields for now.
- `cs-prices.json` doesn't yet carry actual market prices (just metadata)
  because the current price source returned 401. The schema is in place
  under `map[name].steamAnalyst = { price, avg7, avg30, soldLast24h, … }`.
