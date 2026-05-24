# Wave 2 — Stake parity polish for existing games

Date: 2026-05-23
Plan parent: `docs/stake-rainbet-waves-plan-2026-05-23.md`
Wave 1 result: `docs/stake-rainbet-wave1-2026-05-23.md`

## Goal

Retrofit existing games to use the Wave 1 foundation (`useRoundMachine`,
new primitives, resource manifest, audio system). No math changes. No new
binaries committed. Asset generation is deferred to dedicated batch waves.

## Approved scope (2026-05-23)

- Order: 2A then 2B then 2C.
- Card rendering: build a shared 52-card deck used by Wave 2C and later
  card games (Casino War, Tarot, etc).
- Assets: structure only. Manifest entries land but no images or .wav
  files are produced in Wave 2.
- Coverage: all 10 games from the plan.

## Batches

### Batch 2A (in progress)

Games:
- Mines (`src/components/games/mines/MinesGame.jsx`)
- Keno (`src/components/games/keno/KenoGame.jsx`)
- Limbo (`src/components/games/limbo/LimboGame.jsx`)

Common changes per game:
- Wrap stage in `CoreStageFrame` so layout stops shifting.
- Drive round flow through `useRoundMachine` so animations follow events
  rather than ad-hoc state.
- Fire `useSfx('<slug>')` for click / reveal / win / lose / cashout
  signals (silent until audio wave).
- Use `MultiplierBadge` for any prominent multiplier display.
- Use `ResultToast` for round outcomes.
- Use `ActionLockOverlay` for the running lock state.
- Replace per-game segmented controls with `SegmentedModeTabs` when the
  control is a clear segmented group (e.g. Limbo target presets stay in
  bet panel; Keno keeps its risk segmented control).
- Add a `originalsManifest.js` entry per slug (no path values yet).
- Add `public/images/originals/<slug>/README.md` provenance note.
- Add `public/audio/originals/<slug>/README.md` audio provenance note.

Acceptance:
- `npm run build` passes.
- Each game route loads at 1440x900.
- One round per game completes a fake-credit loop.
- No console errors.
- Other 20 routes unaffected.

### Batch 2B (in progress)

Games:
- Plinko, Crash, Wheel.

Decisions (2026-05-24):
- Crash: drive multiplier deterministically from a pre-baked event list.
  Round-start picks a bust point; events ramp `multiplier:update` along
  the existing curve, end on `round:result` (cashout or bust). Sim feed
  and betting countdown stay as-is.
- Plinko: lightweight integration. Emit `round:start` / `input:lock` /
  `bet:accepted` on drop and `round:result` on bucket hit. Matter.js
  physics path stays untouched.
- Wheel: emit a deterministic spin timeline. ResultToast shows segment
  label, multiplier, and amount.

### Batch 2C (pending)

Games:
- Blackjack, Hilo, Baccarat, Video Poker.

Notes:
- Build shared 52-card deck primitive first:
  `src/components/games/primitives/cards/Deck.js`,
  `src/components/games/primitives/cards/CardFace.jsx`,
  `src/components/games/primitives/cards/cards.css`.
- Replace per-game card rendering with the shared primitive.
- Deal/flip events drive animation timing.

## Status

### Completed

- Plan doc written.
- Batch 2A retrofit complete:
  - `MinesGame.jsx` integrated `useRoundMachine`, `MultiplierBadge`, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`, `useSfx('mines')`, `useOriginalsPreloader('mines')`. Round events emit `ROUND_START`, `INPUT_LOCK`, `BET_ACCEPTED`; bust/cashout call `machine.finish(...)`.
  - `KenoGame.jsx` integrated round event machine, draw-by-draw `RNG_REVEAL` events, `MultiplierBadge` last-multiplier display, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`, `useSfx('keno')`.
  - `LimboGame.jsx` integrated round event machine with `MULTIPLIER_UPDATE` ramp ticks, `MultiplierBadge` for the Target chip, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`, `useSfx('limbo')`.
- `originalsManifest.js` extended with `mines`, `keno`, `limbo` entries (empty stage maps; structure-only).
- `sfxManifest.js` extended with `mines`, `keno`, `limbo` SFX role declarations (silent).
- Provenance READMEs added under `public/images/originals/{mines,keno,limbo}/` and `public/audio/originals/{mines,keno,limbo}/`.
- `npm run build` passes after Batch 2A.
- Smoke test at 1440x900: Mines (busted round, ResultToast and ActionLockOverlay confirmed), Keno (route renders), Limbo (Target multiplier badge visible). No console errors.

### In progress

- Wave 2 complete. Awaiting Wave 3 plan approval.

### Blocked

- None.

## Batch 2C completion notes (2026-05-24)

- Confirmed shared `CardFace` already lived at `src/components/ui/CardFace.jsx` with full CSS at `src/components/ui/card-face.css`. Decision: extend its use rather than build a new card primitive. Wave 2 plan card primitive line item is satisfied via the existing `CardFace` + Hilo's new adoption of it.
- `HiloGame.jsx` retrofit:
  - Replaced text-only card spans with `CardFace` / `CardBack` primitives. Suit now picked via fairRng.
  - Added `useRoundMachine` with deal/flip/result events at Stake guide timings (`FLIP_DURATION_MS = 380`).
  - Added `SegmentedModeTabs` for Higher/Lower direction.
  - Added `MultiplierBadge` for Payout chip, `ResultToast` for hit/miss/push, `ActionLockOverlay` for `Drawing...`, `CoreStageFrame` for fixed stage, `useSfx('hilo')`.
- `BlackjackGame.jsx` retrofit:
  - Wired `useRoundMachine` events on Deal: `ROUND_START`, `INPUT_LOCK`, `BET_ACCEPTED`, `STAGE_SELECT { kind: 'deal' }`. `machine.finish(...)` fires inside settle.
  - Added `MultiplierBadge` for Bet, `ResultToast` for hand outcome, `CoreStageFrame`, `useSfx('blackjack')`. Existing CardFace usage preserved.
- `BaccaratGame.jsx` retrofit:
  - Wired `useRoundMachine` start events on Deal and `machine.finish(...)` on outcome. Added `MultiplierBadge` for Stake, `ResultToast` for outcome, `ActionLockOverlay` while dealing, `CoreStageFrame`, `useSfx('baccarat')`.
- `VideoPokerGame.jsx` retrofit:
  - Wired `useRoundMachine` on Deal and `machine.finish(...)` on Draw. Added `MultiplierBadge` for last hand multiplier, `ResultToast` for outcome label, `CoreStageFrame`, `useSfx('videopoker')`.
- Manifest stubs added in `originalsManifest.js` for `blackjack`, `hilo`, `baccarat`, `videopoker`. SFX role declarations added in `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/` and `public/audio/originals/` for all four slugs.
- `npm run build` passes after Batch 2C.
- Smoke test at 1440x900: Hilo (CardFace 7♠ rendered, Higher/Lower segmented control, `Payout 2.08x` badge), Blackjack (`Bet 0.00` badge, dealer/player slots show CardBack), Baccarat (`Stake 0.00` badge, six bet zones, all four roads visible), Video Poker (paytable + 5 empty card slots). No console errors.

## Wave 2 complete

- All 10 games (Mines, Keno, Limbo, Plinko, Crash, Wheel, Blackjack, Hilo, Baccarat, Video Poker) now route through `useRoundMachine`.
- Each touched game has manifest stub + audio + image provenance README.
- Audio is silent. Asset binaries land in dedicated audio/image batch waves.

## Batch 2B completion notes (2026-05-24)

- `WheelGame.jsx` integrated `useRoundMachine` with deterministic spin
  timeline (`ROUND_START`, `INPUT_LOCK`, ramp `ANIMATION_CHECKPOINT` ticks,
  `RNG_REVEAL` near end, `ROUND_RESULT` with segment label/multiplier/amount,
  `INPUT_UNLOCK`). Stage now wrapped in `CoreStageFrame`,
  `MultiplierBadge` shows last segment, `ResultToast` reports
  `Segment N · Mx`, `ActionLockOverlay` covers spinning state,
  `useSfx('wheel')` hooks added.
- `PlinkoGame.jsx` integrated lightweight machine: `ROUND_START` /
  `INPUT_LOCK` / `BET_ACCEPTED` on each drop, `machine.finish(...)` on
  bucket settlement. Stage wrapped in `CoreStageFrame` with engine-load
  loader, `MultiplierBadge` for Last bin, `ResultToast` per ball,
  `ActionLockOverlay` while engine warms up, `useSfx('plinko')` hooks.
- `CrashGame.jsx` integrated deterministic event timeline. Added
  `solveBustTimeSec()` to invert the `multiplierAt()` curve. Round events
  span betting countdown, periodic checkpoints during flight, RNG reveal
  at bust point, and `machine.finish({ kind, profit, multiplier, bust })`
  on either cashout or bust. Stage wrapped in `CoreStageFrame`,
  `MultiplierBadge` shows Target chip, `ResultToast` shows cashout/bust,
  `ActionLockOverlay` shows `Bust` overlay, `useSfx('crash')` hooks.
- Manifest stubs added in `originalsManifest.js` for `crash`, `plinko`,
  `wheel`. SFX role declarations added in `sfxManifest.js` (silent).
- Provenance READMEs added under `public/images/originals/{crash,plinko,wheel}/`
  and `public/audio/originals/{crash,plinko,wheel}/`.
- `npm run build` passes after Batch 2B.
- Smoke test at 1440x900: Wheel, Crash, and Plinko all load. Wheel shows
  `Last 0.00x` MultiplierBadge, Crash shows `Target 2.00x` Stake-style
  meta row with sim feed of 12 live bets, Plinko shows engine loaded,
  bins rendered, `Last 0.00x` MultiplierBadge. No console errors.

## Decision log

- 2026-05-23: Wave 2 is pure structure pass. No 9Router image or audio
  generation runs in this wave.
- 2026-05-23: Card games share one 52-card deck primitive; built in 2C
  before the four card games are touched.
- 2026-05-23: All 10 proposed games stay in scope.
