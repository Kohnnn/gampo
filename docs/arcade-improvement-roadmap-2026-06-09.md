# Arcade / Originals Improvement Roadmap — 2026-06-09

Owner scope: `src/components/games/**` EXCLUDING `slots/` and `cases/`; plus new `*.test.js` for these games. 33 games total.
Shared (coordinate before editing): `src/components/games/primitives/**`, `src/components/EducationPanel.jsx`, `src/hooks/useScrollActionIntoView.js` (read/use, don't change), `browserSmoke.mjs`, `src/data/originalsManifest.js`, `gameDefinitions.js`.

## Context
Games are well-consolidated on shared primitives (BetPanel, StatsOverlay, RecentResultsStrip, GameShell, HistoryDrawer). 25/33 use `CoreStageFrame` (viewport-height clamp); 8 hand-roll stages → no clamp, result can jump/land off-screen on mobile. `useScrollActionIntoView` exists but no arcade game uses it yet. 24/33 games have no test, including house-edge math.

## Gates (every ship must pass)
- `rtk vitest run` green; `rtk npm run build` OK
- `node scripts/browserSmoke.mjs --routes=<changed games> --viewports=390x844,466x704,492x820,1365x768` → 0 overflow / 0 errors, interaction where applicable
- ux=100 on changed routes; a11y/contrast PASS; `qaLayout.contract.test.js` green (layout contract)
- Deploy via `netlify deploy --prod --dir dist`; verify live asset hash == local.

## Tasks

### P0 — Stage unification & reachability
- [ ] **A-P0-1 migrate custom stages to CoreStageFrame**: 8 holdouts lack the `min(...px, calc(100dvh - 220px))` clamp → stages resize/jump on mobile. Priority order: **roulette** (`.roulette-stage` :342), **sicbo** (`.sb-stage` :161), **dino** (`.dino-stage` :179), then coinflip/color/guess/lottery/rps. Keep each game's visual identity; only adopt the frame's height contract. Verify against `qaLayout.contract.test.js`.
- [ ] **A-P0-2 scroll action into view**: wire `useScrollActionIntoView` (src/hooks) into round-start for **roulette, sicbo, blackjack** first (result/action lands below the fold on mobile; same class as the Poker fix). Then keno/baccarat/videopoker/hilo/crash if the pattern proves out.

### P1 — Consistency cleanup
- [ ] **A-P1-1 remove inert overlays**: `ActionLockOverlay active={false}` in blackjack (:596) and videopoker (:240) — either wire it to the real running state or remove. Decide per game.
- [ ] **A-P1-2 consolidate duplicate cashout**: tomeoflife (:297), drill (:252), pump (:199) render a SECOND in-stage cashout button on top of the BetPanel in-round CTA; the other 7 loop games rely solely on the CTA. Pick one pattern (recommend: keep BetPanel CTA only, drop the in-stage duplicate) for consistency.
- [ ] **A-P1-3 war onto playPhase**: `war` uses ad-hoc `.bp-bet-btn` for its tie decision + `runningRound={slamming||phase==='tied'}` instead of the shared `playPhase='in-round'` machine. Bring it onto the shared pattern.

### P2 — Polish
- [ ] **A-P2-1 normalize breakpoints**: one-off near-misses to 768/1024 convention — crash.css `1023`, roulette.css `760`. (Leave intentional design breakpoints; only fix the near-miss seams.)
- [ ] **A-P2-2 derived EV**: coarse hardcoded `winProbability` in videopoker (0.45), blackjack (0.43), packs (0.5), darts (0.6) — derive from engine where feasible (overlaps WS-5).

### P3 — Math test coverage (additive, low collision — new files only)
- [ ] **A-P3-1 diamonds.math.test.js** FIRST — DiamondsGame.jsx:49-55 had a documented ~258% RTP regression; lock the house edge.
- [ ] **A-P3-2** tower, drill, snakes, pump, wheel, keno, dice — RTP/house-edge tests (each carries the edge, currently untested). Replicate the engine math and assert monotonicity + ~edge over N trials (pattern: `crash.math.test.js`, `mines.flip.test.js`).

## Status board
| Task | Priority | Status | Commit | Notes |
|---|---|---|---|---|
| A-P0-1 CoreStageFrame migration | P0 | todo | | roulette/sicbo/dino first (deferred, higher risk) |
| A-P0-2 scroll into view | P0 | DONE | (this batch) | roulette(spinning)/sicbo(running)/blackjack(inRound) via useScrollActionIntoView |
| A-P1-1 inert overlays | P1 | todo | | blackjack/videopoker |
| A-P1-2 dup cashout | P1 | todo | | tomeoflife/drill/pump |
| A-P1-3 war playPhase | P1 | todo | | |
| A-P2-1 breakpoints | P2 | todo | | crash 1023, roulette 760 |
| A-P2-2 derived EV | P2 | todo | | overlaps WS-5 |
| A-P3-1 diamonds test | P3 | DONE | (this batch) | RTP 0.9665 sim, guard <1.5 vs old ~258% |
| A-P3-2 math tests | P3 | DONE | (this batch) | tower/drill/snakes/pump/wheel/keno/dice all house-favorable, near target |
