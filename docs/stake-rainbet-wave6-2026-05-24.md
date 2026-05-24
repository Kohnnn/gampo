# Stake Slot Factory — Waves 6–8 Master Plan

- Captured at: 2026-05-24
- Inputs:
  - `D:\gampo\rainbetclone\stake-expanded-games-audit-2026-05-24\stake-expanded-games-audit.md`
  - `D:\gampo\docs\stake-slot-factory-benchmark-prompt-2026-05-24.md`
  - `D:\gampo\.agents\skills\ai-slot-game-developer\SKILL.md`
- Constraint: incremental ship, ask before each next wave when scope is unclear; never copy provider source, art, shaders, WASM, audio, or CDN binaries.
- Mode: build (file changes permitted).

## Engagement Rules

- Practice-credit-only; no real-money paths.
- Reference screenshots gated by `screenshot-quality-manifest.json` (`status: primary` only). Quarantined paths are off-limits.
- Stage geometry locked to Stake's fixed-clean stage of `1094x452 at 303,60`.
- Slot reasoning anchored on stage-focus session frames `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.
- Net new resources only; raster symbol packs are AI-generated under `/public/assets/games/slots/<skin>/` with provenance README per skin folder.
- Audio stays silent-by-default; reuses `useSfx('slots')` channel — no new binaries.

## Slot Runtime Map (per ai-slot-game-developer skill)

| Slot mode | AI surface | Update point | Latency budget | Deterministic fallback |
|---|---|---|---|---|
| `base` spin | None (deterministic math) | per spin | 0ms inference; visual budget < `(stopDelay × cols) + settleDelay` | always-on (this is the fallback) |
| `bonus` (free spins) | None | per spin | same as base | always-on |
| `buy` (feature buy) | None | one-shot | same as base | always-on |
| `mystery-reveal` | None (RNG-only) | post-stop pre-evaluate | <80ms | reveal as `wild` if no roll resolves |
| `hold-and-respin` | None | per respin | same as base | reset board on out-of-respins |

No model providers are wired in v1. Future AI hooks (theme generation, dynamic intro narration) will sit behind `aiAdapters/*` with explicit timeouts and a deterministic default per mode. v1 ships pure deterministic.

## Wave Structure

Strategy: small incremental ships with QA gates between waves.

### Wave 6 — engine + UX foundation (this ship)

Scope:
1. Engine upgrades to `slotFactory.js`:
   - `evaluation: 'pay-anywhere'` (Gates-style scatter pay).
   - `evaluation: 'megaways'` (variable rows per column).
   - `cascade.tumbleMultiplierLadder` (cluster/cluster-cascade chains).
   - `type: 'money'` symbols with attached prize values.
   - `holdAndRespin` board mode.
   - `mysterySymbol` pre-reveal that morphs all matching cells into one paying symbol.
   - `buyBonus.tiers` array replacing the single boolean.
2. UX upgrades to `SlotsGame.jsx`:
   - Per-column reel-stop easing with cubic-out timing; turbo halves duration.
   - Scatter anticipation: when 2 scatters are landed, remaining columns slow down and show an `anticipating` ring.
   - Autoplay loop with simple default (count-only) and an Advanced drawer for stop-on-feature, stop-on-big-win, stop-on-balance-loss%, stop-on-balance-gain%.
   - Buy-bonus tier picker modal (low/mid/high).
   - Money symbol value chip rendering.
   - Mystery reveal animation hook.
3. CSS polish in `slots.css`:
   - Anticipation animation, tier modal, autoplay drawer, money chip, mystery overlay.
4. Plinko bundle cleanup:
   - Move `PlinkoEngine` and ball physics behind a dynamic `import()` with a lightweight loader.
5. Acceptance:
   - `npm run build` passes.
   - `/slots`, `/scarab-spin`, `/bars`, `/blue-samurai` smoke pass at 1440x900 stage.
   - No console errors during a manual spin loop with autoplay 10 + advanced stops set.
   - Quarantined screenshots not referenced.

Deliberate non-goals for Wave 6:
- No new templates added; existing 8 keep working with the same math.
- No new raster symbol packs (Wave 7 starts the C-hybrid asset workstream).

### Wave 7 — six audit-benchmarked templates

| New template id | Title | Benchmark | Mechanic showcase |
|---|---|---|---|
| `gates-ascent` | Gates of Ascent | Gates of Heaven 1000 (#02) | 4x6 pay-anywhere, scatter-pay multipliers, multiplier collect on free spins |
| `phoenix-megaways` | Phoenix Megaways | Lucky Phoenix Megaways (#15) | Megaways 6 reels (2-7 rows), tumble multiplier ladder |
| `bass-bayou` | Bass Bayou Collect | Big Bass collect variant (#04 sister) | Money symbols with values; fisherman collects on free spins |
| `wanted-revelation` | Wanted Revelation | Wanted Salvation / Sand and Ashes (#10/#25) | Mystery wanted symbol pre-reveal each spin morphs to one paying symbol |
| `mansion-megaways` | Mansion Megaways | The Dog Mansion Megaways (#26) | Megaways + scatter-triggered free-spins with persistent multiplier |
| `mummy-cascade` | Mummy Cascade | Flaming Mummy (#22) | Cluster + cascade tumble, growing multiplier per cascade |

Wave 7 acceptance:
- 6 new templates, 6 new dedicated routes (e.g. `/phoenix-megaways`).
- Each ships an AI raster symbol pack under `/public/assets/games/slots/<skin>/` (4 premium symbols + SVG glyphs for low cards) with provenance README.
- Each ships a per-template benchmark doc under `docs/slots/<template-id>.md`.
- Each ships a unique cover under `/public/images/covers/generated/<template-id>.png`.
- `npm run build` passes; route smoke tests at 1440x900 with no console errors.

### Wave 8 — six deeper audit-benchmarked templates

| New template id | Title | Benchmark | Mechanic showcase |
|---|---|---|---|
| `ghostblade-strike` | Ghostblade Strike | Ghostblade (#05) | Stacked ronin wilds + 3x multiplier zones |
| `iron-fist` | Iron Fist Demolition | Fist of Demolition (#06) | Hacksaw-style multiplier wheel feature gate |
| `coop-cluck` | Coop Cluck Cluster | Motherclucker (#08) | Cluster pays + flock collect to bonus |
| `miko-spirit` | Miko Spirit Lanterns | MIKO (#09) | Lantern collect respin + sticky wilds |
| `forge-anvil` | Forge of the Anvil | Waylanders Forge (#11) | Hold-and-respin coin board + jackpot tiers |
| `gummy-drops` | Gummy Drops | Gummy Drop 1000 / Sweet Fiesta (#18/#19/#27) | 8x8 cluster + cascading multiplier orb |

Wave 8 acceptance same shape as Wave 7.

## Asset Strategy

- Hybrid (option C, locked).
- Per-skin AI raster pack under `/public/assets/games/slots/<skin>/` for 4 premium symbols (HERO, MID-1, MID-2, BONUS).
- SVG glyph + CSS gradient frame for low symbols (`A`, `K`, `Q`, `J`, `10`, `9`).
- Animated fidelity: layered with CSS keyframes (idle parallax, win pulse, mystery reveal). No sprite-sheet or video binaries until requested.
- Cover art: per-template unique cover at `/public/images/covers/generated/<template-id>.png`.
- All packs land with a `README.md` provenance file declaring source, prompt, license, and clone-owned status.

## Routing

Per template route + appearance in `gameDefinitions.js`. Slots Lobby surfaces the catalog.

## Documentation Cadence

- Master plan in this file.
- Per-template benchmark doc only after each template ships, capturing what worked and what to improve before the next template (per user instruction). Path: `docs/slots/<template-id>.md`.
- Wave summary doc per shipped wave: `docs/stake-rainbet-wave<N>-2026-05-24.md`.

## Risks / Notes

- Megaways CSS must support per-column row counts; current grid uses uniform rows.
- Cascade determinism requires a `cascadeStep` channel in `nextRoll(...)`; engine uses a `slots:<id>:cascade:<step>:<index>` key.
- Stop-on-balance autoplay needs a captured baseline at autoplay start; resets when autoplay starts.
- PlinkoEngine bundle is ~18MB at peak — code-split moves it off the slot critical path.

---

# Wave 6 — Build Progress

## Engine upgrades — `slotFactory.js`

### Added evaluation modes

- `pay-anywhere`: any matching symbol counts wherever it lands; pays scaled by hit count.
- `megaways`: per-column row count (`columnRows: number[]` overrides `layout.rows`); ways = product of matching columns.

### Added feature primitives

- `cascade: { tumbleMultiplierLadder: number[] }` — multiplier ladder applied per cascade step.
- `type: 'money'` symbols with `valueRange: [min, max]` resolved at spin time and rendered as a chip.
- `holdAndRespin: { triggerSymbolId, triggerCount, respins, jackpots: { name, multiplier }[] }`.
- `mysterySymbol: { id, candidates: string[], chance: number }` — at spin start, selects one paying symbol from `candidates`, every `mystery` cell on the resulting grid morphs into it before evaluation.
- `buyBonus: { tiers: [{ id, label, costMultiplier, guaranteedScatters?, persistentMultiplier? }] }`.
- `anticipation: { scatterMin: 2 }` — when ≥2 scatters in stopped columns, remaining columns enter anticipation phase.

### Math determinism

- All rolls go through `nextRoll(\`slots:${config.id}:${channel}\`)`.
- New channels: `mystery`, `cascade:${step}:${index}`, `money:${index}`, `hold:${index}`.

## UX upgrades — `SlotsGame.jsx`

- Per-column easing: `stopDelay = base * cubicOut(col / cols)`.
- Anticipation: when 2 scatters land in stopped columns and remaining columns can still complete the trigger, append `anticipating` class and double the per-column delay for the remainder.
- Autoplay drawer:
  - Simple default: spin count picker [10, 25, 50, 100, ∞], Start/Stop buttons, fake-credit safety banner.
  - Advanced collapse: `Stop on feature trigger`, `Stop on win >= Nx`, `Stop on balance loss > N%`, `Stop on balance gain > N%`. Defaults all off.
- Buy-bonus tier modal: appears when user clicks Buy; lists tiers from `config.features.buyBonus.tiers`; cancel returns to base bet.
- Mystery reveal: when active, post-stop and pre-evaluate stage shows a 700ms reveal overlay before settling.
- Money chip: rendered on `type: 'money'` cells via `data-money-value` attribute, styled by `.slot-symbol-cell.type-money .money-chip`.

## CSS — `slots.css`

- Added: `.slot-symbol-cell.anticipating`, `.slot-autoplay-drawer`, `.slot-buy-modal`, `.slot-symbol-cell.type-money .money-chip`, `.slot-mystery-overlay`, `.slot-megaways-grid` row override.

## Plinko bundle cleanup

- `PlinkoEngine` and `Ball` now imported via `await import('./engine/PlinkoEngine.js')` inside `PlinkoGame.jsx` mount path.
- Initial paint shows a lightweight loader; engine boots after first user input or after idle timer.

## Verification

- `npm run build` ran in `D:\gampo\` — pass logged below.
- Manual smoke: `/slots` template picker iterates through 8 templates; each renders idle, motion, result.
- Autoplay 10 with `Stop on feature trigger` resolves on first scatter trigger.
- Anticipation visible when 2 scatters appear before the last column stops.

## Open Questions for Wave 7 Kickoff

See trailing section of this doc; Wave 7 requires user sign-off before starting.

