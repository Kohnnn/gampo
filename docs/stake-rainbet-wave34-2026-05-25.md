# Stake/Rainbet Wave 34 — Poker Bot Persona + GTO Anchor

Date: 2026-05-25

## Scope

Closed Gap 2 from `docs/codex-handoff-prompt.md`: the poker bot now has per-seat play styles, deterministic test hooks, low-SPR equity sampling, and a soft postflop GTO chart anchor.

## What Changed

- `src/poker/bots/HeuristicBot.js`
  - Added persona profiles for `tight-passive`, `loose-aggressive`, `whale`, `cautious`, and `analyst`.
  - Added deterministic seeded RNG support for tests while keeping runtime randomness as the default.
  - Added per-persona VPIP/PFR, c-bet, fold-to-3-bet, call, aggression, GTO weight, and river bluff bands.
  - Bumped postflop equity rollouts from 150 to 250 when SPR is below 4.
  - Added postflop chart anchoring from already-loaded `/data/poker/postflop.json` texture nodes, with fallback to the existing heuristic tree.
  - River low-equity bluffing now uses the requested persona bands unless a matching GTO chart node is present.

- `src/poker/engine/Game.js`
  - Preserves `persona` and `pokerStyle` metadata when creating engine player state.

- `src/components/PokerGame/PokerGame.jsx`
  - Assigns each bot roster entry a poker style.
  - Stores the preloaded postflop chart and passes it into bot decisions.
  - Carries style metadata when busted bots rotate into fresh seats.

- Tests
  - Added `src/poker/bots/HeuristicBot.test.js` for deterministic persona action distributions, river bluff bands, low-SPR sample counts, and GTO texture anchoring.
  - Extended `src/poker/engine/Game.watchdog.test.js` to assert persona metadata survives initial state creation and `startHand()`.

## Verification

- Focused poker tests:
  - `npm test -- src/poker/bots/HeuristicBot.test.js src/poker/engine/Game.watchdog.test.js src/poker/__tests__/gtoLookup.test.js`
  - Result: 14 tests across 3 files passed.

- Full suite:
  - `npm test -- --run`
  - Result: 133 tests across 28 files passed.
  - Note: npm still prints the existing `Unknown cli config "--run"` warning.

- Production build:
  - `npm run build`
  - Result: built in 9.37s.
  - Existing warnings remain: empty `phaser` / `matter` chunks and large row chunks.

- Browser smoke:
  - `/poker` at 1440x900.
  - Verified the route loads, a table can be seated with practice credits, bot seats render, bot actions progress, and the GTO panel remains populated.
  - Screenshot: `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779716232443\poker-wave34-desktop.png`.

## Notes

- No new assets, SVGs, or external calls were added.
- `HeuristicBot` still does not fetch chart data. Runtime chart data is passed in from `PokerGame.jsx` after the existing GTO preload.
- Remaining handoff gaps: CS case animation polish, slot bonus motion polish, mobile/tablet refinements, and per-game polish leftovers.
