# GamPo v4 QA Response — 2026-05-21

## Goal
- Stop "freezes" everywhere — fix root causes (cancellable timeouts,
  visibility recovery, autoplay timeout race, poker bot scheduling).
- User asks:
  1. Plinko autoplay drops multiple balls at ~0.5s interval and ball physics
     are faster overall.
  2. Poker no longer stalls after one raise; GTO chart upgraded with deeper
     coverage and a clearer reading UI.
  3. General gameplay-feel pass continues across every game.
- v4 eval-report items addressed in the same pass.

## Phases

### Phase A — Universal freeze prevention
- New `src/utils/scheduling.js` with `useCancellableTimeouts()` hook.
- Replace every game's `setTimeout(() => setPhase('idle'), N)` with the hook
  so navigations / new rounds drop pending phase resets cleanly.
- BetPanel: wrap each `await onPlay()` in `Promise.race` against a per-game
  budget (default 15s, Lottery 30s) so a stuck round can't hang autobet.
  Emit a toast and stop autobet on timeout.
- Crash: visibility recovery — when the tab returns to focus during a
  `running` round, fast-forward simulated wall-clock and finalise to bust if
  the missed elapsed time crossed the bust point.
- Mines/Crash/Dino/Chicken Cross/Tower/War/Baccarat/Sic Bo: cancellable
  phase resets via the new hook.

### Phase B — Poker
- `PokerGame.jsx`: replace single `stepTimer.current` with a small queue that
  is only cleared when the queued action's `toAct` no longer matches the
  current state. Stops cleanup-on-every-state-change clobbering pending bot
  ticks.
- Watchdog: when `toAct < 0` and `street !== 'showdown'`, force-advance the
  street (or jump to showdown if everyone is all-in).
- 5-second per-turn escape hatch: if a bot's turn doesn't produce a state
  change in 5s, auto-fold them.
- `Game.js advanceStreet`: when `nextActiveIndex` returns -1 (e.g. only
  all-in players left), recurse through remaining streets and conclude.
- GTO chart upgrade: deeper data coverage notes, clearer reading UI
  (frequency bars + EV delta + suggested action highlighted), search input
  for hand groupings, copy fixes.

### Phase C — Plinko
- Faster physics: bump `gravity` 0.5–0.6 → 0.85, drop frame budget per drop
  noticeably.
- `engine.dropBall(binIndex, ballType, opts)` already supports per-ball
  image; expose `_drainPendingResolvers()` so React can resolve orphan
  promises with `{profit:0}` when row/risk changes mid-flight.
- `PlinkoGame.performPlay`: when called with `mode === 'auto'`, resolve
  immediately after `engine.dropBall()` so the BetPanel autoplay loop
  doesn't wait for the ball to land. Settlement still records to history
  via the per-ball settle map.
- BetPanel: new optional `autoIntervalMs` prop (Plinko sets 500). Default
  120 unchanged.
- New "Quick drop" buttons (+1 / +5 / +10) inside Plinko's BetPanel that
  schedule sequential drops at 500ms.

### Phase C+ — Crash
- Bigger 16:9 canvas (520 → 760 wide effective viewport).
- Ported atmosphere from `example/stake-originals-clone`: spaceship sprite
  trail, exhaust GIF, explosion GIF on bust (already wired) — added
  starfield parallax + mini panel below for "Live multiplier" history.
- Multiplier number bigger and tracks color shifts at 2× / 5× / 10× /
  100×.
- New top-of-stage "All players this round" rolling strip widened.

### Phase D — Eval polish
- Sic Bo: `revealed: [true,true,true]` initial + `dice: [1,2,3]` so a real
  pip face shows pre-roll.
- Dice: pip strip always visible; muted `?` chips when no rolls yet.
- Hi-Lo: `<Route path="hilocards" element={<Navigate to="/hilo" replace />} />`.
- Stats panel: explicit empty-state copy + flat baseline chart when no
  entries.
- Color Pick: `contain: layout paint` + `overflow: hidden` on `.color-stage`.
- Wheel: segment labels 22 → 26 px + last-result hub badge.
- Dice category label rename (TABLE MATH → DICE LAB).
- Chat input placeholder: "Type to simulate..." → "Say something...".

### Phase E — Verify
- `npm run build` clean.
- `npm test` 72/72 + new tests for scheduling + poker watchdog +
  plinko autoplay short-circuit + sicbo initial render.
- Append "QA v4 Response" to `progress.md`.

## Risks
- Visibility recovery may surface long-elapsed bust as instant. Mitigation:
  cap fast-forward at 30s; otherwise settle at current multiplier.
- Poker watchdog must not interrupt a legitimate all-in run — guarded by
  inspecting `players.filter(p => p.status === 'allin')` count.
- Plinko `mode: 'auto'` short-circuit means autoplay no longer respects
  stop-on-profit conditions per-ball. Will compute aggregate profit via
  the settle map when each ball lands and stop the BetPanel loop from the
  game side via `abortRef`.

## Files added
- `src/utils/scheduling.js`
- `docs/qa-v4-response-2026-05-21.md`
- 4 new tests

## Files modified
- `src/App.jsx`
- `src/components/games/primitives/BetPanel.jsx`
- `src/components/games/plinko/{PlinkoGame.jsx, engine/PlinkoEngine.js}`
- `src/components/games/crash/{CrashGame.jsx, CrashChart.jsx, crash.css}`
- `src/components/games/{mines,dino,chickencross,tower,war,baccarat,sicbo}/...jsx`
- `src/components/games/sicbo/SicBoGame.jsx`
- `src/components/games/dice/DiceGame.jsx`
- `src/components/games/wheel/{WheelGame.jsx, wheel.css}`
- `src/components/games/color/color.css`
- `src/components/StatsPanel.jsx`
- `src/components/ChatDock.jsx`
- `src/components/PokerGame/PokerGame.jsx`
- `src/components/PokerGame/GtoPanel.jsx`
- `src/poker/engine/Game.js`
- `src/data/gameDefinitions.js`
- `progress.md`
