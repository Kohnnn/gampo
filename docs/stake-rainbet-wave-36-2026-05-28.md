# Wave 36 — CS case feel parity (CaseClicker-grade)

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 19.45s clean.

## Note

This wave was largely shipped by a parallel CODEX `/goal` run before
this wave was tackled here. Audit confirms all five Wave 36 scope items
are present in the codebase. This doc records what's there for the
chronological record.

## What's shipped

- **`src/components/games/cases/casesAnimation.js`** (new) — phase
  constants and helpers:
  - `CASE_LID_LIFT_MS = 260`
  - `CASE_REVEAL_MS = 3500`
  - `CASE_LIGHT_SWEEP_LEAD_MS = 1000`
  - `CASE_PRIZE_ZOOM_LEAD_MS = 600`
  - `CASE_SETTLE_PAD_MS = 60`
  - `CASE_CELEBRATION_RARITIES = Set(['Restricted', 'Classified', 'Covert', 'Extraordinary', 'Contraband', '★'])`
  - `finalPrizeOffset(jitter, prizeIndex, tilePx)` — pure function the
    settle phase uses to compute the final translation.
  - `casePhaseLabel(phase, rows)` — UI label per phase.
  - `shouldCelebrateDrop(drop)` and `pickCelebrationDrop(drops)` —
    drives the post-settle popover.

- **Phase machine** in `CasesGame.jsx`:
  - `casePhase` state cycles through `idle → lid → spinning → finale →
    zoom → settling → idle`.
  - Lid phase plays `cases/lid.wav`, lifts the case card via
    `case-phase-lid` class.
  - Light streak runs in the last 1 s of the spin via `case-phase-finale`.
  - Camera zoom on the prize tile during the last 600 ms via
    `case-phase-zoom`.
  - Mini-celebration popover (`cases-prize-popover`) renders for any
    drop matching `pickCelebrationDrop`.
  - Skip-animation button in the bet panel (`cases-skip-section`)
    short-circuits to settled state and plays a condensed SFX run.

- **CSS** (`cases.css`):
  - `caseLidLift` keyframes (260 ms cubic-bezier).
  - `caseLightSweep` keyframes (1000 ms cubic-bezier).
  - `casePrizeZoom` keyframes (600 ms cubic-bezier).
  - `casePrizeHalo` keyframes (1800 ms ease for celebration popover).
  - `caseLidGlow` keyframes for the gold flash on lid open.

- **`casesAnimation.test.js`** — covers `finalPrizeOffset`,
  `shouldCelebrateDrop`, `pickCelebrationDrop`, and `casePhaseLabel`.
  Currently passes as part of the 143-test suite.

## Verification

- `npm test -- --run` — 143/30 green.
- `npm run build` — clean, 19.45s.

## Files modified

None this wave — all the work was already in place from CODEX. This
close-out doc just records what's there and that it satisfies the Wave
36 scope.
