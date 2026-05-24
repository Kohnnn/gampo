# Stake Slot Factory — Wave 8 close-out

- Captured at: 2026-05-24
- Inputs:
  - `D:\gampo\docs\stake-rainbet-wave6-2026-05-24.md` (engine + UX foundation)
  - `D:\gampo\docs\stake-rainbet-wave7-2026-05-24.md` (Wave 7 templates close-out)
  - `D:\gampo\rainbetclone\stake-expanded-games-audit-2026-05-24\` (visual + behavioral reference, primary screenshots only)

## Decisions locked in for Wave 8

- UI overhaul: replaced the Wave 1-7 stage layout with Slot Factory v2.
- Asset strategy: continued AI raster pack per theme via 9Router (`cx/gpt-5.5-image`), 4 premium symbols + cover per template, provenance README per skin folder.
- Mechanics: variety per template, per ai-slot-game-developer guidance.
- Persistent multiplier baseline 1x, boosted by buy tier or scatter retrigger.
- Cluster cascade ladders tuned per template.
- Slots Lobby surfaces all 20 templates as cards.
- Per-template benchmark notes shipped per template.

## UI overhaul highlights

- New stage shell: cover-art backdrop blurred behind the reel frame; clean header with benchmark, title, meta and feature pills (free spins, persistent multiplier, coin meter, cascade chain).
- Cleaner reel frame and cell styling with gold rail accents and a softer cell border treatment.
- Bottom controls strip with a single oversized spin button, bet readout, win readout, and quick-toggle column for turbo and autoplay.
- New autoplay drawer + buy-tier modal styled as in-stage dialogs with X-close affordance.
- Result banner adds money-collect total when applicable; mystery overlay rewritten as a centered reveal pill.
- Megaways grid retains per-column row count visualization, with anticipation animation on the last two columns.
- Reduced-motion support across all new animations.
- Mobile-first responsive: panel becomes single-column, controls collapse to spin-and-readouts only, megaways grid auto-flexes.

## Templates shipped

| # | Template id | Title | Benchmark | Mechanic showcase | Route |
|---|---|---|---|---|---|
| 1 | `ghostblade-strike` | Ghostblade Strike | Ghostblade (#05) | Stacked ronin wilds + 3x multiplier zones (zones declared) | `/ghostblade-strike` |
| 2 | `iron-fist` | Iron Fist Demolition | Fist of Demolition (#06) | Multiplier-wheel feature gate (5x to 100x) | `/iron-fist` |
| 3 | `coop-cluck` | Coop Cluck Cluster | Motherclucker (#08) | 6x6 cluster with chick collect meter (target 30) | `/coop-cluck` |
| 4 | `miko-spirit` | Miko Spirit Lanterns | MIKO (#09) | Stacked lantern wilds + persistent multiplier | `/miko-spirit` |
| 5 | `forge-anvil` | Forge of the Anvil | Waylanders Forge (#11) | Hold-and-respin coin board (Mini/Minor/Major/Grand jackpots) | `/forge-anvil` |
| 6 | `gummy-drops` | Gummy Drops | Gummy Drop 1000 / Sweet Fiesta (#18/#19/#27) | 8x8 cluster with cascade ladder `[1, 2, 4, 8, 16, 32]` | `/gummy-drops` |

## Asset sourcing

- All AI-generated via 9Router `cx/gpt-5.5-image` (1024x1024 PNG).
- Covers: `public/images/covers/generated/<template-id>.png`.
- Premium symbols (4 per template): `public/assets/games/slots/<skin>/<template-id>-{hero,mid1,mid2,bonus}.png`.
- Provenance README per skin folder.
- One transient HTTP 524 retry handled (`miko-spirit/mid1`); succeeded on retry via `scripts/regenerateOne.mjs`.

## Code changes

- `src/components/games/slots/SlotsGame.jsx`: full rewrite to Slot Factory v2 with cover-backed stage, header pill row, controls strip, persistent multiplier widget, autoplay pill, and buy-tier modal v2.
- `src/components/games/slots/slots.css`: full rewrite for v2 stage; extended skin palette with `ronin`, `iron`, `coop`, `spirit`, `forge`, `gummy`.
- `src/components/games/slots/slotFactory.js`: 6 new template configs; new asset path constants for Wave 8 skins.
- `src/data/gameDefinitions.js`: 6 new game entries with unique covers, accents, and lessons.
- `src/data/casinoCatalog.js`: `slotCatalog` extended to 20 templates.
- `src/App.jsx`: 6 new lazy-loaded routes.
- `scripts/generateSlotArt.mjs`: extended with all 6 Wave 8 template subjects.
- `scripts/regenerateOne.mjs`: retry helper updated with all 12 Wave 7+8 templates.

## Verification

- `npm test` — 86 / 86 pass (no regressions; slot factory tests also cover the new templates via parametrized loops).
- `npm run build` — pass; chunk sizes stable.
- Smoke at 1440x900 with no console errors:
  - `/ghostblade-strike`: ronin pack (MASK / KATA / BLSM / GHST + scatter) renders at 5x4 with cover backdrop, feature pills, and v2 controls.
  - `/gummy-drops`: 64-cell 8x8 cluster grid renders cleanly with all 4 candy symbols + scatter; cascade contract visible in feature contract section.

## Per-template benchmark notes

- `docs/slots/ghostblade-strike.md`
- `docs/slots/iron-fist.md`
- `docs/slots/coop-cluck.md`
- `docs/slots/miko-spirit.md`
- `docs/slots/forge-anvil.md`
- `docs/slots/gummy-drops.md`

## Slot Runtime Map (per ai-slot-game-developer skill)

| Mode | AI surface | Update point | Latency budget | Deterministic fallback |
|---|---|---|---|---|
| `base` spin | None (engine RNG) | per spin | 0ms inference; visual budget `(stopDelay × cols) + settleDelay` | always-on |
| `bonus` (free spins) | None | per spin | same as base | always-on |
| `buy` (feature buy) | None | one-shot | same as base | always-on |
| `mystery-reveal` | None | post-stop pre-evaluate | <80ms | reveal as wild if no roll resolves |
| `cascade` | None | per cascade step | bounded by ladder length | break out on no-win |
| `multiplier-wheel` | None | feature gate trigger | <80ms (metadata) | fall through to scatter pay |
| `hold-and-respin` | None | feature gate trigger | <120ms (metadata) | fall through to scatter pay |

No model providers wired into spin resolution. Asset generation uses 9Router only at build time, never at runtime.

## Risks / follow-ups

- Multiplier-wheel UI for `iron-fist`: contract declared, dedicated wheel cinematic deferred.
- Hold-and-respin board UI for `forge-anvil`: contract declared, board respin cinematic deferred.
- Multiplier zones for `ghostblade-strike`: declared on the config; engine surface ready, evaluator boost in next pass.
- Sticky-wild lock between respins for `miko-spirit`: single-spin v1; cross-spin lock deferred.

## Status

Wave 8 — **shipped**. Engagement complete: 20 templates, 20 routes, 12 AI raster packs, 12 covers, 12 per-template benchmark docs, full UI overhaul, all tests passing, all routes smoke-clean.
