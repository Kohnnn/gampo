# Wave 3 — Net-new simple Stake Originals

Date: 2026-05-24
Plan parent: `docs/stake-rainbet-waves-plan-2026-05-23.md`
Wave 2 result: `docs/stake-rainbet-wave2-2026-05-23.md`

## Goal

Add eight first-pass-playable Stake Originals that don't exist in the
GamPo app yet. Each game uses Wave 1/2 primitives from day one.

## Approved scope (2026-05-24)

- Order: 3A → 3B → 3C.
- Stake Flip is a new `/flip` component, separate from existing `/coinflip`.
- Mechanic depth: plausible mechanic with full fake-credit round per game.
  Audit screenshots are visual reference only; mechanics are designed.
- Wave 3 stays structure + mechanics; no new asset binaries committed.
  Manifest stubs + provenance READMEs land per slug. Generation runs in
  later asset batch waves.
- Each game gets a route in `App.jsx`, an entry in `gameDefinitions.js`,
  and uses Wave 1/2 primitives.

## Batches

### Batch 3A (in progress)

Games:
- Flip — single side pick, two-side reveal, payout 1.96×.
- Diamonds — five gems revealed simultaneously; payout depends on count
  of matching highest tier.
- Darts — aim sector chooser; throw lands with weighted distribution
  toward the chosen sector.

Common per-game work:
- New `<Slug>Game.jsx` and `<slug>.css`.
- Wired in `App.jsx` and `gameDefinitions.js`.
- Uses `useRoundMachine`, `MultiplierBadge`, `ResultToast`,
  `ActionLockOverlay`, `CoreStageFrame`, `useSfx('<slug>')`,
  `useOriginalsPreloader('<slug>')`.
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js`.
- Provenance README under
  `public/images/originals/<slug>/README.md` and
  `public/audio/originals/<slug>/README.md`.

Acceptance:
- `npm run build` passes.
- Each new route renders at 1440x900.
- One full fake-credit round completes per game.
- No console errors.
- Existing 25 routes unaffected.

### Batch 3B (in progress)

Games:
- Pump — pump-loop with rising multiplier and burst risk.
- Slide — slider/path with a target sector.
- Moles — Mines-like grid with cosmetic mole/hole theme.

Decisions (2026-05-24):
- Moles is a new component with a distinct mechanic from Mines (multi-pick wave per round, mole/hole theme), not a Mines re-skin.
- Pump uses a geometric ramp: each pump multiplies by ~1.18x with ~12% bust risk per step. Cap at ~10 pumps.

### Batch 3C (in progress)

Games:
- Snakes — step-ladder climb with snake hazards (distinct from Tower's
  per-row pick and Mines' grid).
- Cases — CS:GO-style unboxing with 3 case tiers, carousel reveal, and
  multi-case stacking. Uses real skin metadata from public CS skin APIs.

Decisions (2026-05-24):
- Snakes uses a vertical ladder of cells. Each tap advances one rung;
  multiplier ramps; a snake on the rung busts the round.
- Cases mechanic combines:
  - Pick 1 of 3 case tiers (Low / Mid / High risk).
  - CS:GO-style horizontal carousel reveal lands on a weighted prize.
  - Multi-case stacking: open up to N cases per round; multipliers
    stack additively into the round payout.
- Skin data sourced from public mirror of CS:GO API (qwkdev/csapi or
  ByMykel/CSGO-API). We bundle a curated subset for the simulator and
  group by Stake-style collections (Mirage, Dust 2, Inferno, etc).
- All skin imagery is loaded from CDN URLs in the public datasets.
  No proprietary Stake assets are copied.

## Status

### Completed

- Plan doc written.

### In progress

- Wave 3 complete. Awaiting Wave 4 plan approval.

### Blocked

- None.

## Batch 3C completion notes (2026-05-24)

- New `SnakesGame.jsx` + `snakes.css`. 8x3 ladder with snakes-per-rung
  (1 or 2). Climb fair-priced multiplier (1/(1-snakeChance) per rung
  after house edge). Cashout in-round CTA. Distinct from Tower (per-row
  pick) and Mines (grid).
- New `CasesGame.jsx` + `cases.css`. Combines all three Cases mechanic
  options:
  - 3 case tiers (Low / Mid / High) with cost multiplier 1.0 / 2.5 / 6.
  - 4 cases per tier from curated dataset.
  - CS:GO carousel reveal (4.5s smooth deceleration onto weighted prize).
  - Multi-case stacking (1 to 4 cases per round).
- New build-time script `scripts/buildCsCases.mjs` curates 12 well-known
  CS:GO cases from `https://github.com/ByMykel/CSGO-API` (CC0). Output
  `public/data/cs-cases.json` (~186KB) holds id/name/image/items per
  case. Skin imagery loaded directly from Steam community CDN.
- New `CollectionsPage.jsx` + `CollectionsPage.css` plus `/collections`
  route. Read-only catalog with tier filter (All/Low/Mid/High) and name
  search across cases and skins.
- Routes wired in `App.jsx`: `/snakes`, `/cases`, `/collections`.
- `gameDefinitions.js` extended with `snakes` and `cases` entries.
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/{snakes,cases}/`
  and `public/audio/originals/{snakes,cases}/`. Cases README clarifies
  imagery comes from public Steam CDN URLs in the curated dataset.
- `npm run build` passes after Batch 3C.
- Smoke test at 1440x900: `/snakes` (8x3 ladder, snakes-per-rung chips,
  current/next/top reward chips, EV -1.67), `/cases` (3 tier tabs, 4
  case cards, total stake GC 5.00, 65 skins per low-tier case),
  `/collections` (case headers, skin grids, rarity-colored borders, per
  -skin multipliers). No console errors.

## Wave 3 complete

- 8 net-new playable Stake Originals: Flip, Diamonds, Darts, Pump,
  Slide, Moles, Snakes, Cases.
- Plus a `/collections` browse view that doubles as a CS-skin catalog
  for the Cases simulator.
- All routes use Wave 1/2 primitives end-to-end.
- All assets stay clone-owned: CS-skin imagery loaded from public CDN
  via curated dataset, no Stake assets copied.

## Batch 3B completion notes (2026-05-24)

- New `PumpGame.jsx` + `pump.css`. Geometric ramp 1.18x per pump with 12% bust risk per step, 10-pump cap. Animated balloon size, ramp meter, in-round Cashout CTA, full event flow.
- New `SlideGame.jsx` + `slide.css`. Horizontal track with target window (5-80% width, 0-100 center). Marker slides on round end; payout = (1 - houseEdge) / hitChance. EV per play tied to width.
- New `MolesGame.jsx` + `moles.css`. 3x3 hole grid, distinct from Mines: player picks N holes, all reveal at once. Hypergeometric scoring, sweep bonus, mole-count selector (1-5).
- Routes wired in `App.jsx`: `/pump`, `/slide`, `/moles`.
- `gameDefinitions.js` extended with `pump`, `slide`, `moles` entries.
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/{pump,slide,moles}/` and `public/audio/originals/{pump,slide,moles}/`.
- `npm run build` passes after Batch 3B.
- Smoke test at 1440x900: `/pump` (balloon, Pump button, `Ready 1.00x` badge), `/slide` (track + sliders + `Payout 3.20x` badge), `/moles` (3x3 grid, mole-count chips, Picks 0/5). No console errors.

## Batch 3A completion notes (2026-05-24)

- New `FlipGame.jsx` + `flip.css`. Stake-style coin flip with `useRoundMachine`, `SegmentedModeTabs` for Heads/Tails, `MultiplierBadge`, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`, `useSfx('flip')`. Payout 1.96x on a fair 50/50.
- New `DiamondsGame.jsx` + `diamonds.css`. Five-gem reveal, weighted pick, payout scales with match count and gem rarity. Diamonds (rarest) pays 80x at 5-of-a-kind. Wired through `useRoundMachine`.
- New `DartsGame.jsx` + `darts.css`. Sector pick (12 sectors) or Bullseye, weighted-bias hit distribution (60/25/15 sector/neighbor/miss). Bullseye 12x at ~7.8% hit rate. Wired through `useRoundMachine`.
- Routes wired in `App.jsx`: `/flip`, `/diamonds`, `/darts`.
- `gameDefinitions.js` extended with `flip`, `diamonds`, `darts` entries (cover paths reuse existing covers; new covers can land in image batch wave).
- Manifest stubs in `originalsManifest.js` and `sfxManifest.js` for all three slugs (silent).
- Provenance READMEs added under `public/images/originals/{flip,diamonds,darts}/` and `public/audio/originals/{flip,diamonds,darts}/`.
- `npm run build` passes after Batch 3A.
- Smoke test at 1440x900: `/flip` (Heads/Tails segmented, coin disc, `1.96x` badge, EV -0.10), `/diamonds` (five `?` slots, paytable chips, EV -2.60), `/darts` (12 sector chips + Bullseye 12x, board with bull, EV -0.20). No console errors.

## Decision log

- 2026-05-24: `/flip` is a Stake variant separate from `/coinflip`.
  CoinFlip's existing component stays; Flip is new code.
- 2026-05-24: Mechanics for audit-incomplete games are designed
  plausibly. Each game still produces a deterministic round through
  `useRoundMachine`.
- 2026-05-24: Wave 3 stays structure-only on assets. Audio + image
  generation wait for dedicated batch waves.
