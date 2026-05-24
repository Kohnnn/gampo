# Wave 4 — Heavy / themed Stake Originals

Date: 2026-05-24
Plan parent: `docs/stake-rainbet-waves-plan-2026-05-23.md`
Wave 3 result: `docs/stake-rainbet-wave3-2026-05-24.md`

## Goal

Ship 4 heavier net-new Stake Originals (Drill, Tome of Life, Tarot,
Packs) plus 3 slot themes (Scarab Spin, Bars, Blue Samurai) layered onto
the existing `SlotsGame`.

## Approved scope (2026-05-24)

- Order: 4A → 4B → 4C.
- Slot themes get per-title mechanic differentiation, not just palette swaps.
- Tome of Life and Tarot are distinct card-flavored reveal mechanics:
  - Tome of Life: page progression that compounds across 3 reveals.
  - Tarot: classic 3-card past/present/future spread with weighted suit payouts.
- Wave 4 stays structure + mechanics. No new asset binaries committed.

## Batches

### Batch 4A (in progress)

Games:
- Drill — multi-layer mining/dig: each tap drills one layer; deeper layers
  pay more but bust risk rises with depth.
- Packs — pack opening with 3 reveal slots; weighted by pack tier.

### Batch 4B (in progress)

Games:
- Tome of Life — 3-page progressive reveal. Symbols Sun / Moon / Star / Skull.
  Sun pays 1.4x stage, Moon pays 2.2x stage, Star is a wild that doubles
  the next page, Skull busts. Multipliers compound across pages. Cashout
  after page 1 or 2 to lock partial winnings.
- Tarot — 3-card Past/Present/Future spread. Player picks a suit
  (Wands / Cups / Swords / Pentacles) before reveal; cards matching the
  picked suit get a 3x bonus multiplier on top of their base value.

Decisions (2026-05-24):
- Tome of Life multipliers compound additively across pages so a Moon then
  Sun then Sun reads as 2.2 + 1.4 + 1.4 -> 5.0x stake. Skull on any page
  busts. Star applies a 2x bonus to the *next* page, not the current.
- Tarot uses a 22-card Major Arcana subset bucketed into the 4 suits.
  Each card has a base multiplier; matching-suit cards get tripled.
  Round payout = sum of three card contributions vs stake.

### Batch 4C (pending)

Games (slot themes layered on `SlotsGame`):
- Scarab Spin — Egyptian theme with scarab respin trigger.
- Bars — classic 3-reel layout with bars/sevens/cherries symbol set.
- Blue Samurai — Eastern theme with stacked wilds.

## Status

### Completed
- Plan doc written.

### In progress
- Wave 4 complete. Awaiting Wave 5 plan approval.

### Blocked
- None.

## Batch 4C completion notes (2026-05-24)

- Extended `slotFactory.js` with three new templates: `scarab-spin`, `bars`, `blue-samurai`. Each template declares a unique feature object so future engine work can branch on it (`scarabRespin`, `classicThreeReel`, `stackedWildReel`).
- Added `initialTemplateId` prop to `SlotsGame` so each route can mount the engine with its theme preselected. Internal state derives from the prop without breaking the existing template dropdown.
- Routes wired in `App.jsx`: `/scarab-spin`, `/bars`, `/blue-samurai` — all three reuse the lazy-loaded `SlotsGame` chunk.
- `gameDefinitions.js` extended with all three slot theme entries.
- Manifest stubs added in `originalsManifest.js` (kebab-case keys for `scarab-spin` and `blue-samurai`) and `sfxManifest.js`.
- Provenance READMEs added under `public/images/originals/` and `public/audio/originals/` for all three slugs.
- `npm run build` passes after Batch 4C.
- Smoke test at 1440×900: `/scarab-spin` (5x3 ways, "3+ scarabs to trigger respin", scarab/pharaoh/eye/ankh symbols), `/bars` (3x1 lines, classic Sevens / BBB / BB / Bell / Cherry, low volatility), `/blue-samurai` (5x4 lines, "Stacked Samurai turns reel wild", shogun/katana/blossom/dragon/samurai symbols). Template dropdown shows all 8 slot themes (5 originals + 3 new). No console errors.

## Wave 4 complete

- 4 net-new heavy Stake Originals: Drill, Packs, Tome of Life, Tarot.
- 3 slot themes layered onto SlotsGame: Scarab Spin, Bars, Blue Samurai.
- All routes use Wave 1/2 primitives end-to-end where applicable; slot themes reuse the existing template engine.
- Manifest stubs + provenance READMEs for all 7 new slugs.

## Batch 4B completion notes (2026-05-24)

- New `TomeOfLifeGame.jsx` + `tomeoflife.css`. 3-page progressive reveal
  with Sun (+1.4×), Moon (+2.2×), Star (×2 next-page wild), Skull
  (bust). Multipliers compound additively across pages; Star arms a
  next-page double. Cashout after page 1 or 2 to lock partial winnings;
  page 3 auto-resolves.
- New `TarotGame.jsx` + `tarot.css`. 22-card Major Arcana subset
  bucketed into 4 suits. Player picks a suit before the pull; 3 cards
  reveal as Past / Present / Future. Cards matching the picked suit get
  a 3× bonus on their base contribution.
- Routes wired in `App.jsx`: `/tomeoflife`, `/tarot`.
- `gameDefinitions.js` extended with `tomeoflife` and `tarot` entries.
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/{tomeoflife,tarot}/`
  and `public/audio/originals/{tomeoflife,tarot}/`.
- `npm run build` passes after Batch 4B.
- Smoke test at 1440×900: `/tomeoflife` (3 page slots, "Read page 1"
  CTA, paytable visible, top reach 13.2×), `/tarot` (4 suit chips, 3
  hidden cards, "Pull Wands" CTA, suit bonus ×3, top single ×4.80). No
  console errors.

## Batch 4A completion notes (2026-05-24)

- New `DrillGame.jsx` + `drill.css`. 8-layer mineshaft (Topsoil → Bedrock Core, multipliers 1.10× → 18×, bust chance 6% → 38% per layer). In-round Cashout CTA, layer-by-layer reveal, deterministic round events.
- New `PacksGame.jsx` + `packs.css`. 3 tier picker (Common / Rare / Mythic) with cost multipliers ×1.0 / ×3.0 / ×8.0 and weighted reveal pools. 3 cards reveal with stagger (220ms), per-card multipliers, total payout = mean of three picks × stake.
- Routes wired in `App.jsx`: `/drill`, `/packs`.
- `gameDefinitions.js` extended with `drill` and `packs` entries.
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/{drill,packs}/` and `public/audio/originals/{drill,packs}/`.
- `npm run build` passes after Batch 4A.
- Smoke test at 1440×900: `/drill` (8 layers, Drill button disabled until bet placed, EV -0.30 chip), `/packs` (3 tier chips, 3 hidden card slots, Open Common ×1.0 CTA, paytable). No console errors.

## Decision log

- 2026-05-24: Slot themes get per-title mechanic differentiation; not
  just symbol swaps.
- 2026-05-24: Tome of Life and Tarot share card flavor but use distinct
  designed mechanics.
- 2026-05-24: Drill and Packs ship as separate components from Mines and
  Cases respectively.
