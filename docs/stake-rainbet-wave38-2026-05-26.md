# Stake/Rainbet Wave 38 - Per-game Polish Leftovers

Date: 2026-05-26

## Scope

Closed Gap 6 from `docs/codex-handoff-prompt.md`: the remaining low-risk per-game polish items now have CSS-owned motion, reduced-motion fallbacks, and route-level browser smoke coverage.

## What Changed

- `src/components/games/roulette/RouletteGame.jsx`
  - Splits the wheel state into `is-spinning` and `is-idle` classes.
  - Keeps the existing spin transform path intact while exposing idle start/end CSS variables.

- `src/components/games/roulette/roulette.css`
  - Adds a slow idle wheel loop through `rouWheelIdle`.
  - Disables the idle loop under `prefers-reduced-motion`.

- `src/components/games/blackjack/BlackjackGame.jsx`
  - Adds a transient chip-slide state when a new practice hand is dealt.
  - Marks the Hit and Stand controls with `bj-primary-action` for small-phone touch target rules.

- `src/components/games/blackjack/blackjack.css`
  - Adds a chip-slide animation from the control rail into the table stage.
  - Locks the Blackjack stage overflow so the transient chip cannot bleed into adjacent panels.
  - Raises small-phone primary action targets to 50px with 16px text.

- `src/components/games/lottery/LotteryGame.jsx`
  - Adds a short settling state after the draw finishes.
  - Clears the settling timer on unmount and when a later draw starts.

- `src/components/games/lottery/lottery.css`
  - Adds the `lotSettleWobble` damped ending motion.
  - Extends reduced-motion coverage across shake, settle, drum, counter, ball, and hit animations.

- `src/components/games/tower/TowerGame.jsx`
  - Adds a ladder pulse key that resets per round and updates on each safe climb.
  - Applies per-tile reveal delay variables to lit ladder tiles.

- `src/components/games/tower/tower.css`
  - Adds a staggered `towerLadderReveal` animation.
  - Extends reduced-motion coverage for current, fallen, and ladder reveal states.

- `src/components/games/chickencross/ChickenCrossGame.jsx`
  - Tracks the previous and next safe lanes for a one-step transition effect.
  - Resets lane transition state when a new crossing starts.

- `src/components/games/chickencross/chickencross.css`
  - Adds lane fade-in and fade-out animations for successful crossings.
  - Disables the lane fades under reduced motion.

- `src/components/games/videopoker/VideoPokerGame.jsx`
  - Adds a short hold-pulse state when a card hold toggles.
  - Clears the hold pulse on a new deal and on unmount.

- `src/components/games/videopoker/videopoker.css`
  - Adds separate pulse treatments for newly held and newly unheld cards.
  - Extends reduced-motion coverage to the new hold pulse.

## Verification

- Full suite:
  - `npm test -- --run`
  - Result: 143 tests across 30 files passed.
  - Note: npm still prints the existing `Unknown cli config "--run"` and `--localstorage-file` warnings.

- Production build:
  - `npm run build`
  - Result: built in 8.22s.
  - Existing warnings remain: empty `phaser` / `matter` chunks and large row chunks.

- Browser smoke:
  - Web-game Playwright client loaded `/blackjack` and wrote `output\web-game-wave38-polish\shot-0.png`; its fresh browser context still logs the known isolated `net::ERR_NETWORK_ACCESS_DENIED` resource denial.
  - `/roulette` at 1440x900: `.rou-wheel.is-idle` rendered with computed `rouWheelIdle` animation, 18s duration, and no horizontal overflow.
  - `/blackjack` at 1440x900: Deal Hand triggered `.bj-chip-slide` with `GC 5.00`, stage overflow was hidden, and Hit / Stand kept `bj-primary-action`.
  - `/blackjack` at 390x844: Deal Hand kept no horizontal overflow, chip slide rendered, and primary action height measured 50px.
  - `/lottery` at 1440x900: Draw Lottery rendered five balls and reached the new `.lot-tumbler.settling` state without horizontal overflow.
  - `/tower` at 1440x900: Start Tower then Climb up produced `.tower-tile.lit.ladder-reveal` with a computed reveal delay.
  - `/chickencross` at 1440x900: Start Crossing then a safe Cross next produced both `.cc-lane.fade-out` and `.cc-lane.fade-in`.
  - `/videopoker` at 1440x900: Deal then card hold produced `.vp-card-slot.held.hold-pulse`.
  - Screenshots:
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779757520209\wave38-videopoker-desktop.png`
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779757520209\wave38-blackjack-mobile.png`

## Notes

- No new images, new SVGs, 9router calls, SteamAnalyst calls, or provider/source assets were added.
- All new motion is local CSS/React state and has a reduced-motion fallback.
- This closes the final explicit handoff gap. The remaining work is an end-to-end handoff audit only.
