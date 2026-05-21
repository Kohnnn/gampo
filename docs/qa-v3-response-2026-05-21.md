# GamPo v3 QA Response — 2026-05-21

## Goal
Land all P0/P1/P2 items from `docs/evaluationreport.md` (v3 audit), plus the
user-driven asks: kill the 336px right gutter, add PnL stats next to Race in
the chat dock, allow uncapped Plinko multi-ball with per-ball coin art,
improve gameplay feel across all originals, and give every game a unique
sidebar icon.

## Phases

### Phase A — Route safety
- Add `<Navigate>` aliases `casinowar` → `/war` and `colorpick` → `/color`.
- Add `*` catch-all rendering a NotFoundPage.
- Wrap lazy-loaded game routes in an `<ErrorBoundary>`.

### Phase B — Layout + ChatDock + Stats panel
- Remove `html.chat-open .main-content { padding-right: 336px }`.
- Add a Stats tab beside Chat / Race in `ChatDock`.
- Add `useGlobalPnl` hook + StatsPanel rendering profit summary + PnL chart
  for session / this-game / all-time scopes.
- Persist all-time history to `localStorage`.

### Phase C — Sic Bo + Baccarat
- New `<SicBoDie value={n} />` component drawing pip faces (CSS grid).
- Hydrate Baccarat `outcomes` from `session.history`; record `meta.outcome`
  on each round; show face-down `<CardBack/>` × 2 pre-deal.
- Fix derived-road grid placement.

### Phase D — Plinko multi-ball
- Drop the `running` gate.
- Per-ball image + color attached to engine `Ball` instance via
  `dropBall(binIndex, ballType, image, color)`.
- Settle map keyed by ball-id so concurrent drops resolve their own promises.
- Engine refactor preserves existing single-ball behavior.

### Phase E — Polish
- Mines grid: `min-width 320px`, `min-height 320px`, `max-width 480px`.
- Dice pip strip: gate on `session.history.length > 0`.
- Wheel labels: 18 → 22 px.
- Chicken Cross idle lane separators.
- Sidebar: 2-position collapse (icon-only ↔ full) + unique per-game SVG
  glyphs.

### Phase F — Game feel
- Universal `useTremor()` hook + `gampo-shake` keyframe.
- Crash: particle trail behind rocket + shake on bust + per-tick audio click.
- Plinko: brighter peg cascade (12 → 18 frames, wider halo).
- Mines: particle burst on every safe reveal.
- Dino: parallax cloud layer + motion-blur on jump.
- Slots: anticipation slowdown when 2 of 3 paying symbols already landed.
- Wheel / Roulette: per-pin tick audio during deceleration.

### Phase G — P4 long tail
- Promotions: per-card gradient + emoji marker.
- Risk Academy: scrub residual dev attribution.
- ChatDock send button contrast + chat icon swap + unread badge.

### Phase H — Verify
- `npm run build` clean.
- `npm test` 61 → 65 passing.
- Append to `progress.md`.

## Risk notes
- Removing the 336px gutter shifts content right-ward on wide screens (user
  accepted).
- Uncapped Plinko multi-ball can stack 60+ balls; engine pool stays small
  thanks to `_handleBallFinish` removal in `updateBalls`.
- Phase F adds animations everywhere; everything respects
  `prefers-reduced-motion`.
- Chart.js stays code-split inside ChatDock chunk (only loads when Stats tab
  is opened).

## Files added
- `src/components/NotFoundPage.jsx`
- `src/components/ErrorBoundary.jsx`
- `src/components/StatsPanel.jsx`
- `src/components/games/sicbo/SicBoDie.jsx`
- `src/components/games/sicbo/SicBoDie.css`
- `src/hooks/useGlobalPnl.js`
- `src/utils/tremor.js`
- `src/components/games/crash/CrashTrail.jsx`
- `docs/qa-v3-response-2026-05-21.md`

## Files modified
- `src/App.jsx`
- `src/components/Sidebar.jsx`
- `src/components/ChatDock.jsx` + `ChatDock.css`
- `src/styles/index.css`
- `src/components/games/plinko/PlinkoGame.jsx`
- `src/components/games/plinko/engine/PlinkoEngine.js`
- `src/components/games/plinko/engine/Ball.js`
- `src/components/games/sicbo/SicBoGame.jsx` + CSS
- `src/components/games/baccarat/BaccaratGame.jsx` + CSS
- `src/components/games/dice/DiceGame.jsx`
- `src/components/games/mines/{MinesGame.jsx, mines.css}`
- `src/components/games/dino/engine/DinoEngine.js`
- `src/components/games/slots/SlotsGame.jsx`
- `src/components/games/wheel/{WheelGame.jsx, wheel.css}`
- `src/components/games/roulette/RouletteGame.jsx`
- `src/components/games/chickencross/chickencross.css`
- `src/components/games/crash/{CrashGame.jsx, crash.css}`
- `progress.md`

## Out of scope
- Backend API changes.
- Brand-new games.
- Full responsive overhaul (only sidebar icon mode).
