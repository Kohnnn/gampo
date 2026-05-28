# Wave 37 — Slot mid-bonus anim + sim-bet strip + smarter poker bot

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 41.8s clean.

## Note

This wave was shipped by parallel CODEX runs before this audit pass. All
three Wave 37 scope items are present and tested. This doc records what
landed.

## What's shipped

### Slot mid-bonus animations

In `src/components/games/slots/slots.css` (30 `@keyframes` blocks total):

- **`slotWheelLandingWobble`** — wheel disc spin ends with a damped
  spring wobble before locking on the value. Replaces the previous
  hard cut.
- **`slotHoldNewFill`** — each newly filled hold-and-respin tile
  pulses 1× → 1.18× → 1× with tinted shadow burst.
- **`slotRetriggerFly`** — when free-spin retrigger fires, the new
  spin count number flies from each scatter cell into the free-spin
  pill in the header (`var(--fly-delay)` per scatter, 0.32 s
  cubic-bezier ease-out).
- **`slotFreeSpinPillCatch`** — pill bounces when the fly-in arrives.
- **`slotCascadeTrace`** — between cascade steps the dropping cells
  briefly mask under a dotted-line trace (200 ms each).
- All animations honor `prefers-reduced-motion: reduce` via the
  global `.gampo-reduce-motion` class.

### SimBetStrip primitive + 6 game wirings

- **`src/components/games/primitives/SimBetStrip.jsx`** (1.6 KB) — a
  shared primitive that ingests one row per round and renders an
  8-12 row scrolling strip of sim-player bets. Each row carries
  persona, bet, target, settlement, and an optional cell count.
- Wired into:
  - `DiceGame.jsx`
  - `KenoGame.jsx`
  - `LimboGame.jsx`
  - `MinesGame.jsx`
  - `PlinkoGame.jsx`
  - `WheelGame.jsx`
- Reuses the 18-player roster + 6 persona templates from
  `src/context/SocialContext.jsx`. Whales bias higher bets / longer
  targets, cautious players the opposite.

### Smarter poker bot

In `src/poker/bots/HeuristicBot.js` — accepts a `persona` prop and
applies persona-specific biases:

- **`tight-passive`**: vpip −0.08, pfr −0.12, cbet 0.18, fold-to-3bet
  0.78, river bluff 0.04, gto weight 0.24.
- **`loose-aggressive`**: vpip +0.10, pfr +0.13, cbet 0.56, fold-to-3bet
  0.40, river bluff 0.18, gto weight 0.30.
- **`whale`**: vpip +0.16, pfr +0.04, cbet 0.42, fold-to-3bet 0.28,
  river bluff 0.25, gto weight 0.18.
- **`cautious`**: vpip −0.12, pfr −0.14, cbet 0.16.
- **`analyst`**: balanced biases, soft anchor to GTO chart on
  matched textures.

Postflop equity bumped from 150 → 250 rollouts when SPR < 4. Soft
anchor to `/data/poker/postflop.json` GTO frequencies on matched
textures via `gtoWeight` per persona. River bluff frequency pulls
from persona band.

### Tests

Existing 143 tests cover the bot watchdog and crash-math contracts,
SimBetStrip primitive math, etc. No new tests added this audit; all
passing.

## Verification

- `npm test -- --run` — 143/30 green.
- `npm run build` — clean, 41.81s.

## Files (already in place from CODEX)

- `src/components/games/primitives/SimBetStrip.jsx`
- `src/components/games/slots/slots.css` — added 5 mid-bonus animations
- `src/poker/bots/HeuristicBot.js` — persona profiles + GTO anchor
- 6 game JSX files — wired SimBetStrip
