# Stake Slot Factory — Wave 12 close-out (live poker depth)

- Captured at: 2026-05-24
- Inputs: Wave 11 close-out follow-ups (rebuy, cash-game, chip motion,
  time-bank UI, ICM nudges).

## Scope shipped

### 1. Rebuy prompt when human stack hits 0

- After every showdown, if `human.stack <= 0`, `setRebuyPrompt(true)` opens a
  modal explaining the rebuy option.
- New `rebuy()` adds `initialBuyInRef.current` back to the human seat and
  flips `seat.status` to `active`. `placeBet` charges the cost, with balance
  guard.
- `declineRebuy()` ends the session as a buyout-loss with the existing toast.
- `nextHand()` now triggers the rebuy prompt instead of auto-leaving on bust.

### 2. Cash-game format

- New format toggle in the lobby: `Sit-and-go (60h)` or `Cash game (5/10)`.
- `cashGameLevel()` returns fixed `sb=5`, `bb=10`, `ante=0` for cash mode.
- Hand counter still increments for history but no SNG hand limit applies in
  cash mode.
- New `topUp()` action: only visible in cash format. Restores the human stack
  back up to the original buy-in by drawing from `balance`. No-op when stack
  is already at full buy-in. New `Top Up` button rendered in the info strip
  alongside `Cash Out`.

### 3. Animated chip-into-pot motion

- New effect tracks `lastPutInRef` snapshot per seat. Whenever any seat's
  `putIn` rises, a `pk-chip-motion` element is appended with the seat index
  and delta amount.
- Chip elements auto-clean after 1.1s.
- CSS `@keyframes pkChipFly` animates each chip from its seat origin toward
  the felt center using per-seat `--cx` / `--cy` translate variables, with a
  fade out at the end. Six per-seat origins map cleanly to the existing
  `seat-0` through `seat-5` positions.

### 4. Time-bank countdown UI

- New per-bot `pk-think-ring` rendered as an absolutely positioned conic
  gradient mask. The CSS variable `--p` (0..1) drives the ring fill.
- A `requestAnimationFrame` loop ticks `thinkProgress` from 0 to 1 over
  `BOT_THINK_MS = 1100`, matching the existing decision delay. The ring
  fades cleanly when the bot's turn ends.
- Only appears on non-human seats whose turn is active; reduced motion falls
  through to the standard CSS variable, which keeps the gradient static.

### 5. Short-stack push/fold ICM nudges

- New block in `HeuristicBot.js` activates when `stackBb <= 12` on preflop
  and difficulty is `intermediate` or `advanced`.
- Push floors scale by stack and position:
  - `≤ 6 BB`: late position 0.42 / early 0.50
  - `≤ 9 BB`: 0.48 / 0.58
  - `≤ 12 BB`: 0.55 / 0.65
- Facing a raise tightens the floor by +0.07.
- When equity ≥ floor and a raise action exists, the bot jams (`raiseAct.max`)
  instead of mid-sized opens. Otherwise calls only when chips are essentially
  committed (`callAct.amount >= me.stack * 0.6`), or folds.

## Verification

- `npm test` — 90 / 90 tests pass.
- `npm run build` — pass.
- Smoke `/poker`:
  - **Lobby**: `Sit-and-go (60h)` and `Cash game (5/10)` tabs render with the
    cash variant selectable. Updated copy: "Bots rotate when busted; rebuy
    any time."
  - **Cash format active**: info strip shows `Format: Cash`, blinds locked at
    `5/10`, ante `—`, Top Up + Cash Out buttons rendered side by side.
  - **Chip motion**: blind posts produce visible `+GC 5.00` / `+GC 10.00`
    chip-fly overlays from the SB and BB seats toward the pot.
  - **Bot rotation, difficulty pills, bet pills, GTO panel** all carry over
    from Wave 11 with no regressions.

## Code touched

- `src/components/PokerGame/PokerGame.jsx` — full rewrite for format selector,
  rebuy modal, top-up action, chip-motion side-effect, time-bank progress
  driver.
- `src/components/PokerGame/PokerGame.css` — format toggle, top-up button,
  rebuy prompt, chip-motion overlay + per-seat origins, time-bank ring.
- `src/poker/bots/HeuristicBot.js` — short-stack push/fold ICM nudges
  inserted before the standard action tree.

## Open follow-ups (deferred)

- Cash-game multi-level option (5/10, 10/20, 25/50) tied to lobby copy.
- Reload top-up that adjusts the round's `currentBet` when the human stack
  was short of the required call before topping up. Current behaviour
  topUps the seat between hands only.
- Time-bank ring sound cue on tick-down for accessibility.
- Rebuy at any chip count (currently only triggered on bust); a reload button
  in the info strip would let the user top up to a custom amount.

## Status

Wave 12 — **shipped**.

## Engagement totals (Waves 6 → 12)

- 20 slot templates on dedicated routes, unique covers + AI symbol packs.
- Slot Factory v2 stage UI with cover backdrop, header pill row,
  free-spin session loop with retrigger + end banner, idle bob + win burst.
- 11 evaluation/feature primitives: line / ways / megaways / cluster /
  pay-anywhere / cascade ladder / money / mystery / sticky-wild / multiplier
  zones / multiplier wheel / hold-and-respin / buy-tier picker.
- Plinko engine outcomes split per row count, lazy-loaded.
- Game shell fits one viewport; titlebar split into Display + Game-tools
  groups (Stake/Rainbet style).
- **Live poker** with persistent info strip, cash-out-early flow, bot
  rotation, expanded persona pool, ante-aware bot aggression, smarter raise
  sizing, difficulty mistake injection, mid-hand confirm dialog, rebuy
  prompt, cash-game format with top-up, animated chip-into-pot motion,
  time-bank ring on bot seats, short-stack push/fold ICM nudges.
- 90 / 90 tests passing.
