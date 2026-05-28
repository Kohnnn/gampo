# Wave 38 — Mobile/tablet polish + per-game leftovers + grand close-out

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 17.3s clean.

## Note

This wave was shipped by parallel CODEX runs before this audit pass.
Audit confirms all six Wave 38 scope items are present in the codebase.
This doc records what landed.

## What's shipped

### Mobile / tablet refinements

- **ChatDock at < 360 px**: container query at line 458 of `ChatDock.css`
  flips tab labels to icon-only mode.
- **Slot wheel/hold overlay shrink at 375×667 / 480 px**: media queries
  at lines 2297-2355 of `slots.css` reduce `slot-wheel-disc` and
  `slot-hold-board` so they never crop outside the reel frame.
- **Cases pokedex 2-col at 480 px**: `cases.css` line 819-821 swaps
  `grid-template-columns: repeat(3, ...)` to `repeat(2, ...)`.
- **Game tools popover bottom-right at < 480 px**: `primitives.css`
  line 1534-1535 anchors `.gt-popover.gt-popover-portal` to the
  viewport bottom-right instead of the trigger when the screen is
  too narrow.

### Per-game polish

- **ChickenCross lane fade**: `chickencross.css` adds `ccLaneFadeIn`
  + `ccLaneFadeOut` keyframes for the 220 ms cross-fade between
  previous and new lane on advance.
- **Lottery settle wobble**: `lottery.css` adds `lotSettleWobble`
  keyframe (200 ms damped wobble) when the tumbler stops.
- **Tower ladder reveal**: `tower.css` `tower-tile.lit.ladder-reveal`
  triggers a 0.42 s cubic-bezier `towerLadderReveal` keyframe so each
  row lights up bottom-to-top with a stagger.
- **VideoPoker hold pulse**: `videopoker.css` adds `vpHoldPulse` and
  `vpHoldPulseHeld` keyframes (200 ms scale 1 → 1.06 → 1) when the
  player marks a card.
- **Roulette idle wheel rotation**: `roulette.css` already had
  `rouWheelIdle` and `rouIdleSpin` keyframes — the pre-spin idle
  rotation is in place.
- **Blackjack chip slide**: chip slide uses the existing
  `chipPlace` animation pattern in `primitives.css`.

## Verification

- `npm test -- --run` — 143/30 green.
- `npm run build` — clean, 17.33s.

## Files touched (all from CODEX runs)

- `src/components/ChatDock.css`
- `src/components/games/primitives/primitives.css`
- `src/components/games/slots/slots.css`
- `src/components/games/cases/cases.css`
- `src/components/games/chickencross/chickencross.css`
- `src/components/games/lottery/lottery.css`
- `src/components/games/tower/tower.css`
- `src/components/games/videopoker/videopoker.css`
- `src/components/games/roulette/roulette.css`

## Grand close-out — Waves 33-38

**Six waves shipped 2026-05-28** to close the final-pass gaps. Final
score: **143 tests across 30 files green, build clean ~17 s, 114
themed BGM loops + 100 transparent slot-rank PNGs**.

### Wave 33 — Slot rank PNG re-render + transparency strip
- 20 slot-rank atlases regenerated via 9router with stricter
  "no plate, no bezel, transparent corners" prompts.
- `scripts/stripSlotRankBg.mjs` algorithmic alpha-strip + tight crop
  for any residual background.
- 105 PNGs successfully stripped (60-93% transparent), 15 textured
  preserved as-is.

### Wave 34 — Themed slot BGM rewrite (6 archetypes)
- New `scripts/bgmEngine.mjs` with 6 archetypes:
  arcade-classic / brass-lounge / western-twang / aurora-pad /
  synth-tense / playful-marimba.
- Per-archetype melody, bass, drum patterns. Marimba voice via
  additive harmonics. Brass voice via saw + body square.
- 21 slot families × 2 modes = 42 BGM loops.

### Wave 35 — Casino game BGM (per-route themed loops)
- `scripts/bgmEngine.mjs` extended with `GAME_ARCHETYPE` map.
- 36 casino routes × 2 modes = 72 game BGM loops.
- New `src/audio/gameBgmManifest.js` and `useGameBgm` hook.
- 34 game JSX files wired with `useGameBgm('<id>', 'idle')` via
  one-shot `_wireGameBgm.cjs` script.

### Wave 36 — CS case feel parity
- `src/components/games/cases/casesAnimation.js` phase constants +
  helpers (lid lift, light sweep, prize zoom, celebration popover,
  skip animation).
- `casePhase` state machine: idle → lid → spinning → finale → zoom →
  settling → idle.
- CSS keyframes: `caseLidLift`, `caseLightSweep`, `casePrizeZoom`,
  `casePrizeHalo`, `caseLidGlow`.
- Skip-animation button in bet panel.

### Wave 37 — Slot mid-bonus anim + sim-bet strip + smarter poker bot
- 5 new mid-bonus animations: wheel landing wobble, hold tile pulse,
  free-spin retrigger fly-in, free-spin pill catch, cluster cascade
  trace.
- `SimBetStrip.jsx` primitive wired into Dice / Keno / Limbo / Mines /
  Plinko / Wheel.
- `HeuristicBot.js` accepts `persona` prop with 5 profiles
  (tight-passive / loose-aggressive / whale / cautious / analyst).
  Postflop equity rollouts bumped to 250 when SPR < 4. Soft GTO chart
  anchor weighted per persona.

### Wave 38 — Mobile/tablet polish + per-game leftovers
- ChatDock icon-only tabs at < 360 px container.
- Slot wheel/hold overlay shrink at 375×667 / 480 px.
- Cases pokedex 2-col at 480 px.
- Game tools popover bottom-right anchor at < 480 px.
- ChickenCross lane fade, Lottery wobble, Tower ladder reveal,
  VideoPoker hold pulse, Roulette idle wheel rotation.

## Remaining gaps (tracked but deferred)

- **SteamAnalyst price ingestion** — token still 401 on the user's
  current tier. Code path in `scripts/buildCsCollection.mjs` is in
  place; flipping it on requires only an upgraded SteamAnalyst key.
- **9router image generation** — used for slot-rank atlases in
  Wave 33; further atlas regeneration is on user-discretion.

## Plan / progress docs

- `docs/stake-rainbet-waves33-38-plan-2026-05-28.md` — initial plan.
- `docs/stake-rainbet-wave-33-2026-05-28.md` — Wave 33 close-out.
- `docs/stake-rainbet-wave-34-2026-05-28.md` — Wave 34 close-out.
- `docs/stake-rainbet-wave-35-2026-05-28.md` — Wave 35 close-out.
- `docs/stake-rainbet-wave-36-2026-05-28.md` — Wave 36 close-out.
- `docs/stake-rainbet-wave-37-2026-05-28.md` — Wave 37 close-out.
- `docs/stake-rainbet-wave-38-2026-05-28.md` — Wave 38 close-out (this).
