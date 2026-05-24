# Stake Slot Factory — Wave 9 close-out (deferred items)

- Captured at: 2026-05-24
- Inputs: Wave 6/7/8 close-outs and per-template benchmark notes under `docs/slots/`.

## Scope

Wave 9 closes the four follow-up items deferred from Wave 8 plus the bundle-size
clean-up that had been deferred since Wave 6.

## Items shipped

### 1. Multiplier-zone math boost for `ghostblade-strike`

- New helper `applyMultiplierZones(wins, config)` scales any win whose indexes
  cross a column listed in `features.multiplierZones.columns` by
  `features.multiplierZones.multiplier`.
- Works for line, ways, megaways, cluster, and pay-anywhere evaluators.
- Adds a `multiplier-zone` feature event with `zoneHits` count.
- `ghostblade-strike` config already had `multiplierZones: { columns: [1, 2, 3], multiplier: 3 }`.

### 2. Sticky-wild cross-spin lock for `miko-spirit`

- `resolveSlotSpin(config, { stickyWilds: number[] })` forces those grid indexes
  to render as the wild symbol before mystery / evaluation.
- `SlotsGame.jsx` accumulates wild positions during free-spin sessions when the
  config sets `features.stickyWild` or `stackedWildReel.sticky`. Lock clears
  when the free-spin session ends.
- `miko-spirit` updated to opt in via `stickyWild: true` and
  `stackedWildReel.sticky: true`.

### 3. Multiplier-wheel cinematic UI for `iron-fist`

- New helper `resolveMultiplierWheel(config)` deterministically picks a value
  from `features.multiplierWheel.values` weighted by `features.multiplierWheel.weights`,
  using a single `nextRoll('slots:<id>:wheel')`.
- The wheel only resolves when the spin triggers free spins, matching the
  Hacksaw multiplier-wheel feature gate.
- New `<div class="slot-wheel-overlay">` in `SlotsGame.jsx` renders a centered
  reveal pill ("Multiplier wheel · 25× · added to spin") with a 1.4s scale-and-rotate
  cinematic.

### 4. Hold-and-respin board UI for `forge-anvil`

- New helper `resolveHoldAndRespin(config, cells)` simulates a 12-slot coin
  board for `features.holdAndRespin.respins` rounds. Each empty slot has a
  deterministic chance to fill on every step using `nextRoll('slots:<id>:hold:fill:<step>:<index>')`.
- Awards Mini / Minor / Major / Grand from `holdAndRespin.jackpots` based on
  final filled count.
- New `<div class="slot-hold-overlay">` renders a 4×3 board with filled coin
  glow and the awarded tier label, plus respin meta.

### 5. PlinkoEngine outcomes split (lazy per row count)

- The 16.5 MB `plinkoOutcomes.js` lookup table was split into nine per-row
  modules at `src/components/games/plinko/engine/outcomes/rows-<N>.js` (rows 8–16).
- New loader `plinkoOutcomesLoader.js` lazy-imports only the active row count.
- `PlinkoEngine` now imports `loadOutcomes` / `getCachedOutcomes` instead of
  the giant module; `_kickOutcomesLoad` runs on construct and after every
  `updateRowCount`.
- The legacy `plinkoOutcomes.js` is now a tiny shim (`export const OUTCOMES = {}`)
  for backwards compatibility; no live code path imports it anymore.

#### Bundle impact

- Before: one `PlinkoEngine` chunk at 18.4 MB minified / 7.9 MB gzip,
  loaded on every `/plinko` route open.
- After: nine `rows-<N>` chunks at ~2.0 MB minified / ~880 kB gzip each.
  `/plinko` defaults to row 16 so initial fetch is one ~2 MB chunk.
  Switching rows lazy-loads the new chunk on first use.

## Verification

- `npm test` — 90 / 90 tests pass.
- `slotFactory.test.js` extended with 4 new cases (multiplier zone, hold-and-respin
  metadata, multiplier wheel resolve, sticky-wild lock).
- `npm run build` — pass.
  - Largest non-vendor chunk dropped from 18.4 MB to 2.05 MB.
  - `SlotsGame` chunk grew slightly to 54.89 kB / 15.11 kB gzip from added
    overlays + helpers.
- Smoke `/plinko` at 1440×900: engine boots, "Drop Ball" enables, canvas
  renders, no console errors.

## Slot Runtime Map (per ai-slot-game-developer skill)

| Mode | AI surface | Update point | Latency budget | Deterministic fallback |
|---|---|---|---|---|
| `base` spin | None (engine RNG) | per spin | visual budget `(stopDelay × cols) + settleDelay` | always-on |
| `bonus` (free spins) | None | per spin | same as base | always-on |
| `buy` (feature buy) | None | one-shot | same as base | always-on |
| `mystery-reveal` | None | post-stop pre-evaluate | <80ms | wild fallback |
| `cascade` | None | per cascade step | bounded by ladder length | break out on no-win |
| `multiplier-zone` | None | post-evaluate | <2ms | identity if zone empty |
| `multiplier-wheel` | None | feature gate trigger | <2ms | scatter pay only |
| `hold-and-respin` | None | feature gate trigger | <2ms (simulated steps) | smallest tier or none |
| `sticky-wild-lock` | None | spin start | <1ms (mutate input cells) | drop on session end |

## Risks / follow-ups

- The hold-and-respin board UI is presented as a still summary; an animated
  per-step fill cinematic is a candidate for Wave 10 polish.
- The multiplier-wheel reveal is a single-shot pill; a wheel-spin animation
  with tick sound is a candidate for Wave 10.
- Ghostblade Strike's multiplier zone is now in math; a visible column tint
  in the reel frame is a candidate for Wave 10 polish.
- The PlinkoEngine row chunks are still ~2 MB each. Future optimization could
  pack the X positions as binary arrays or quantize to 16-bit fixed-point to
  cut chunk size by 4×; out of scope for Wave 9.

## Status

Wave 9 — **shipped**.

## Engagement totals (Waves 6 → 9)

- 20 slot templates on 20 dedicated routes.
- 12 AI raster packs (48 premium symbols) and 12 unique covers.
- 12 per-template benchmark docs.
- Slot Factory v2 stage UI with cover backdrop, header pills, controls strip,
  autoplay drawer, buy-tier modal, mystery / wheel / hold-and-respin overlays.
- Engine primitives: line / ways / megaways / cluster / pay-anywhere
  evaluation; cascade ladder; money symbols; mystery pre-reveal; sticky-wild
  lock; multiplier zones; multiplier wheel; hold-and-respin; buy-tier picker.
- Plinko engine outcomes split per row count, lazy-loaded.
- 90 / 90 tests passing.
