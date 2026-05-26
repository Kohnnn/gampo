# Stake/Rainbet Wave 35 - CS Case Animation Polish

Date: 2026-05-26

## Scope

Closed Gap 3 from `docs/codex-handoff-prompt.md`: the CS case open flow now has a short lid-lift beat, staged reel phases, a deterministic skip path, and a compact rare-drop celebration layer without adding external assets.

## What Changed

- `src/components/games/cases/casesAnimation.js`
  - Centralizes reveal timing constants, the target prize index, final reel offset math, action-lock phase labels, and rare-drop celebration selection.
  - Keeps case settlement offsets deterministic and unit-testable instead of burying reel math inside the React component.

- `src/components/games/cases/CasesGame.jsx`
  - Added `casePhase` states for `lid`, `spinning`, `finale`, `zoom`, `settling`, and `idle`.
  - Starts each round with a short lid-lift phase before the carousel spins.
  - Schedules finale light sweep and target prize zoom near the end of the reveal.
  - Adds `Skip animation`, which settles the same pending practice round immediately, records the drop, updates session/balance/history, and clears scheduled timers.
  - Uses one guarded `finishPendingRound()` path for both natural settlement and skipped settlement so the payout/history path cannot double-settle.
  - Adds a center-screen prize popover for Restricted+ / special variant drops.

- `src/components/games/cases/cases.css`
  - Adds the CSS-only lid lift, glow, light sweep, target tile zoom, prize popover, and skip button states.
  - Includes reduced-motion fallbacks for the new animations.

- Tests
  - Added `src/components/games/cases/casesAnimation.test.js` for final offset math, phase labels, celebration thresholds, and best-drop selection.

## Verification

- Focused cases tests:
  - `npm test -- src/components/games/cases/casesAnimation.test.js src/hooks/useCaseCollection.test.js`
  - Result: 11 tests across 2 files passed.

- Full suite:
  - `npm test -- --run`
  - Result: 137 tests across 29 files passed.
  - Note: npm still prints the existing `Unknown cli config "--run"` warning.

- Production build:
  - `npm run build`
  - Result: built in 9.12s.
  - Existing warnings remain: empty `phaser` / `matter` chunks and large row chunks.

- Browser smoke:
  - `/cases` at 1440x900: verified idle state, `case-phase-lid`, action-lock label `Lifting lid...`, enabled skip button during a pending round, natural settlement into history/PnL, and skipped settlement through the same result/history path.
  - `/cases` at 390x844: verified no horizontal overflow after a settled result and the case stage stays within the viewport width.
  - Console remained clean except for normal Vite and React dev messages.
  - Screenshots:
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779716232443\cases-wave35-spinning.png`
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779716232443\cases-wave35-mobile.png`

## Notes

- No provider/source assets were added.
- Browser smoke temporarily played several GC 5.00 practice rounds; persisted `gampo_credits` was restored to `508.4` afterward.
- Remaining handoff gaps: slot bonus motion polish, mobile/tablet refinements, and per-game polish leftovers.
