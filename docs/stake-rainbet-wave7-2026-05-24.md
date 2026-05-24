# Stake Slot Factory — Wave 7 close-out

- Captured at: 2026-05-24
- Inputs:
  - `D:\gampo\docs\stake-rainbet-wave6-2026-05-24.md` (Wave 6 master plan + Wave 7 question list)
  - `D:\gampo\rainbetclone\stake-expanded-games-audit-2026-05-24\` (visual + behavioral reference, primary screenshots only)
  - `D:\gampo\.agents\skills\ai-slot-game-developer\` (slot runtime contract)
  - `D:\gampo\.agents\skills\9router-image\SKILL.md` (asset generation)

## Decisions locked in for Wave 7

- Asset strategy: **C (hybrid)**. Premium symbol packs generated via **9Router /v1/images/generations** (`cx/gpt-5.5-image`). Low cards keep classic SVG/PNG glyphs. 1024x1024 covers per template, also AI-generated.
- Megaways density: 6 reels with hardcoded per-column rows. `phoenix-megaways = [4,5,6,6,5,4]`, `mansion-megaways = [3,5,7,7,5,3]`. Per-spin row randomization deferred to a future variant.
- Persistent multiplier: starts at 1x; grows by +1 per scatter retrigger (carried in `featureEvents[].persistentMultiplier`).
- Mystery candidate pool: curated per template. `wanted-revelation` morphs only into mid/high pays (`badge`, `watch`, `rope`).
- Cluster cascade ladder for `mummy-cascade`: `[1, 2, 3, 5, 10]`.
- Slots Lobby surfaces all 14 templates as cards (`slotCatalog` rewired).
- Per-template benchmark notes shipped as the templates ship.

## Templates shipped

| # | Template id | Title | Benchmark | Mechanic showcase | Route |
|---|---|---|---|---|---|
| 1 | `wanted-revelation` | Wanted Revelation | Wanted Salvation / Sand and Ashes (#10/#25) | Mystery wanted-symbol pre-reveal morphs all wanted cells into one paying symbol per spin | `/wanted-revelation` |
| 2 | `gates-ascent` | Gates of Ascent | Gates of Heaven 1000 (#02) | 6x6 pay-anywhere with persistent multiplier and Olympus Buy super tier | `/gates-ascent` |
| 3 | `bass-bayou` | Bass Bayou Collect | Big Bass Rock and Roll (#04 sister) | Money symbols carry attached prize values; spin total includes `moneyTotal` | `/bass-bayou` |
| 4 | `mummy-cascade` | Mummy Cascade | Flaming Mummy (#22) | 6x6 cluster pays with cascade ladder `[1, 2, 3, 5, 10]` | `/mummy-cascade` |
| 5 | `phoenix-megaways` | Phoenix Megaways | Lucky Phoenix Megaways (#15) | 6-reel megaways with `[4,5,6,6,5,4]` rows + cascade tumble | `/phoenix-megaways` |
| 6 | `mansion-megaways` | Mansion Megaways | The Dog Mansion Megaways (#26) | 6-reel megaways with `[3,5,7,7,5,3]` bulge + persistent multiplier (Crypt Buy +2x) | `/mansion-megaways` |

## Asset sourcing log

All AI-generated via 9Router `cx/gpt-5.5-image` (1024x1024 PNG), saved to:

- Covers: `public/images/covers/generated/<template-id>.png`
- Premium symbols (4 per template — hero, mid1, mid2, bonus): `public/assets/games/slots/<skin>/<template-id>-<role>.png`
- Provenance README per skin folder declaring generator, model, license, and prompt subjects.

Two transient HTTP 524 retries occurred during generation (`gates-ascent/mid2`, `phoenix-megaways/hero`); both succeeded on the retry pass via `scripts/regenerateOne.mjs`. All 24 premium symbol files plus 6 covers landed clean.

## Code changes

- `src/components/games/slots/slotFactory.js`: 6 new template configs appended; new asset path constants `wanted/olympus/bayou/mummy/phoenix/mansion` added.
- `src/data/gameDefinitions.js`: 6 new entries with unique covers, accents, and lessons.
- `src/data/casinoCatalog.js`: `slotCatalog` rewritten to surface 14 real templates.
- `src/App.jsx`: 6 new lazy-loaded routes mounted on `<SlotsGame initialTemplateId="..." />`.
- `scripts/generateSlotArt.mjs`: new script producing covers + symbol packs + provenance README per template.
- `scripts/regenerateOne.mjs`: new retry helper for transient image-generation failures.

## Verification

- `npm test` — 86 / 86 tests pass.
- `npm run build` — pass; bundle: `index-CVz-3PGp.js` 104.76 kB / 31.35 kB gzip; slots remain split per `SlotsGame-*.js`.
- Smoke `/wanted-revelation` at 1440x900: BADGE/WATCH/ROPE/WNTD scatter symbols render with mystery feature contract and dark-win overlay flag visible.
- Smoke `/gates-ascent`: 6x6 pay-anywhere grid renders with Olympus pack (BOLT/CRWN/SAND/J + scatter GATE), feature contract reads `Pay anywhere | High | Scatter bonus`.
- Smoke `/phoenix-megaways`: 6 columns with row counts 4/5/6/6/5/4 visible; megaways column layout active; feature tags `Megaways | Very high | Scatter bonus | Cascade ladder`.
- Console clean across all three (no errors, no asset 404s).

## Per-template benchmark notes

- `docs/slots/wanted-revelation.md`
- `docs/slots/gates-ascent.md`
- `docs/slots/bass-bayou.md`
- `docs/slots/mummy-cascade.md`
- `docs/slots/phoenix-megaways.md`
- `docs/slots/mansion-megaways.md`

Each note follows the schema agreed in Wave 6: layout, controls, spin timing, win/result presentation, feature affordances, missing deltas, reference screenshots, resources.

## Slot Runtime Map (per ai-slot-game-developer skill)

| Mode | AI surface | Update point | Latency budget | Deterministic fallback |
|---|---|---|---|---|
| `base` spin | None (engine RNG) | per spin | 0ms inference; visual budget `(stopDelay × cols) + settleDelay` | always-on |
| `bonus` (free spins) | None | per spin | same as base | always-on |
| `buy` (feature buy) | None | one-shot | same as base | always-on |
| `mystery-reveal` | None (RNG-only) | post-stop pre-evaluate | <80ms | reveal as wild if no roll resolves |
| `cascade` | None (RNG-only) | per cascade step | bounded by ladder length | break out of cascade loop on no-win |

No model providers wired into spin resolution. Asset generation uses 9Router only at build time, never at runtime.

## Risks / follow-ups

- Per-spin megaways row randomization is not yet active; current rows are fixed.
- No persistent multiplier widget on the stage; the value lives inside `featureEvents` payloads.
- Free-spin loop runs on the same `performSpin()` path; counting + persistent multiplier history is implicit through repeated calls. A dedicated free-spin session container is queued for a later wave.
- Cascade visualization is a single feature event chip; the engine truly tumbles cells but the user sees only the final settled state. A staged cascade-by-cascade animation is queued.

## Status

Wave 7 — **shipped**.

Pause here. Awaiting your green light to start Wave 8 (Ghostblade Strike, Iron Fist Demolition, Coop Cluck Cluster, Miko Spirit Lanterns, Forge of the Anvil, Gummy Drops).
