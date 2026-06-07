# Backlog completion + new features — plan & progress (2026-06-07)

Branch: `codex/gampo-polish-deploy` (also fast-forwarded to `origin/main`)
Production: https://gampo-educational-simulator.netlify.app

## Scope (user-approved)
1. Finish the post-pass reinforce backlog.
2. Build: lower-effort + high-impact items, plus Strategy Sandbox, Accessibility pass, Achievements.
3. Save/restore option — **local only** (export/import JSON or localStorage snapshot). No backend/server/database.
4. Document plan + progress (this file).

## Architecture facts this work builds on
- Persisted state uses a module-scope **singleton + listener Set** hook pattern; keys are `gampo_*`. No shared storage util yet.
- Per-round stats fan out from `useGameSession.record()` → `recordPnl`, `recordProgressRound`, `recordMissionRound`, `recordXpRound`.
- Per-game EV/RTP metadata lives in `src/data/gameDefinitions.js` (`rtp`, `houseEdge`, `volatility`, `hitFrequency`, `lesson`).
- EV surfaces precedent: `OddsPopup.jsx` (static metadata) and poker `GtoPanel.jsx` (live decision+freqs+rationale).
- Achievements: `src/data/achievements.js` + `useProgress`. Missions: `src/data/missions.js` + `useMissions`. Toasts mount in `Layout.jsx`.
- Settings are scattered (reduce-motion in `fx/index.jsx`, fun-mode in `utils/funMode.js`, audio context). No settings page / app-settings context. No density mode.
- Routing: games are `React.lazy` already. Plinko `rows-*` 2MB chunks are already lazy per-row-count (not first-load).
- Tests: stub `globalThis.localStorage` with a Map, call `reset*()` in `beforeEach`, drive exported mutators.

## Plan / batches
Each batch: implement → unit tests → `vitest run` → build → commit. Deploy + prod verify at the end.

- [x] B0. Investigate infra (subagent inventory complete).
- [ ] B1. Reinforce backlog
  - [ ] B1a. Shared `src/utils/storage.js` (read/write/remove helpers) — adopt incrementally, no risky mass refactor.
  - [ ] B1b. Shared `<GameTitleBar>` extraction OR documented decision to defer (Poker/Sportsbook).
  - [ ] B1c. Mobile dock primitive consolidation OR documented decision.
  - [ ] B1d. Breakpoint custom-media note (already unified to 768px in prior commit).
- [ ] B2. Lower-effort + high-impact
  - [ ] B2a. Settings context + Settings panel (theme accent / density / reduce-motion / fun-mode in one place).
  - [ ] B2b. Density/compact mode (`data-density` on shell + CSS).
  - [ ] B2c. Generalized EV coach surface reused across games (from gameDefinitions metadata).
  - [ ] B2d. Session insight dashboard (realized vs theoretical RTP, variance, streaks, "real-stakes" framing).
- [ ] B3. Strategy Sandbox (headless N-round simulation + bankroll distribution chart).
- [ ] B4. Accessibility pass (ARIA, focus order on portaled sheet, contrast, reduced-motion coverage).
- [ ] B5. Achievements expansion + learning-tied achievements.
- [ ] B6. Local save/restore (export/import JSON snapshot of all `gampo_*` keys).
- [ ] B7. Full verify (vitest + build + prod smoke + UX benchmark + bet-sheet check), commit, push, merge origin/main, deploy, verify live.

## Progress log
- 2026-06-07: Inventory complete. Confirmed plinko `rows-*` chunks already lazy (bundle item largely moot). Doc created. Starting B1.
- 2026-06-07: Built tested engine/util foundation (no UI yet):
  - `src/utils/storage.js` (+test, 8 pass) — shared localStorage helpers + `gampo_*` snapshot/restore.
  - `src/hooks/useLocalSave.js` (+test, 6 pass) — export/import save file (B6, no backend).
  - `src/utils/evCoach.js` (+test, 7 pass) — generalized EV coach (theoretical vs observed, verdict, lesson).
  - `src/utils/strategySandbox.js` (+test, 8 pass) — headless Monte-Carlo of staking strategies (B3 engine).
  - Bundle note: plinko `rows-*` (2MB each) are already lazy per-row-count; not first-load. First-load `index-*.js` ~199KB. No split needed.
- 2026-06-07: Hooks/data layer (no UI yet):
  - `src/hooks/useSettings.js` (+test, 7 pass) — accent theme + density + reduce-motion, applied to `<html>` (B2a/B2b).
  - `src/data/achievements.js` — new `learning` group (5 achievements) + group label (B5).
  - `src/hooks/useProgress.js` — `oddsViewed`/`sandboxRuns` stats + `recordLearningEvent('odds'|'sandbox')` (test updated, 8 pass).
  - Full suite: PASS (325).
- 2026-06-07: UI surfaces + routes:
  - `/sandbox` Strategy Sandbox page (`StrategySandboxPage.jsx` + `sandbox.css`) — runs `strategySandbox`, histogram, presets, `recordLearningEvent('sandbox')`.
  - `/settings` Settings page (`SettingsPage.jsx` + `settings.css`) — accent/density/reduce-motion via `useSettings`, save export/import via `useLocalSave` (B6 UI).
  - `/insights` Session Insight dashboard (`InsightsPage.jsx` + `insights.css` + `sessionInsights.js` +test 6 pass) — realized vs theoretical RTP, streaks, per-game, real-stakes framing (B2d).
  - `useSettings()` mounted in `Layout.jsx`; accent/density applied to `<html>`.
  - `GameToolbar.openOdds` now fires `recordLearningEvent('odds')`.
  - Sidebar nav: Strategy Sandbox + Session Insights under Progress, Settings under Account.
  - Build OK; full suite PASS (331).
- 2026-06-07: Accessibility pass (B4) + benchmark polish:
  - `scripts/auditA11y.mjs` (+`npm run audit:a11y`) — checks unnamed buttons/links, unlabeled form controls, focusable primary, sandbox-runs, console errors.
  - Audited `/settings /insights /sandbox` + lobby/games: fixed HomePage search input missing `aria-label`.
  - Added `data-ux-primary-action` to Settings export + Insights CTAs; added Settings hero quick export/import (above mobile fold).
  - Registered sandbox/settings/insights page roots as scroll owners in `browserSmoke.mjs`.
  - New pages: a11y PASS, ux=100 on 390x844 + 1365x768. Bet-sheet regression PASS. Full suite PASS (331).
