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
- [x] B1. Reinforce backlog
  - [x] B1a. Shared `src/utils/storage.js` (read/write/remove helpers) — adopted by useSettings/useLocalSave.
  - [~] B1b. Shared `<GameTitleBar>` — DEFERRED (rationale below).
  - [~] B1c. Mobile dock primitive consolidation — DEFERRED (rationale below).
  - [x] B1d. Breakpoint unified to 768px in prior commit (`b0769caa`).
- [x] B2. Lower-effort + high-impact
  - [x] B2a. Settings hook + Settings page (accent / density / reduce-motion).
  - [x] B2b. Density/compact mode (`data-density` on `<html>` + CSS).
  - [x] B2c. Generalized EV coach util (`evCoach.js`).
  - [x] B2d. Session insight dashboard (`/insights`).
- [x] B3. Strategy Sandbox (`/sandbox`, headless sim + histogram).
- [x] B4. Accessibility pass (audit script + fixes).
- [x] B5. Achievements expansion (learning group + learning events).
- [x] B6. Local save/restore (`useLocalSave`, Settings export/import).
- [ ] B7. Full verify, commit, push, merge origin/main, deploy, verify live.

## Deferral rationale (B1b / B1c)
Both are pure code-dedup refactors of surfaces (Poker titlebar, the three mobile docks)
that were *just* stabilized and verified in commit `b0769caa` (bet-sheet fix, breakpoint
unification, z-index tokenization). Extracting a shared `<GameTitleBar>` or a single dock
primitive would re-touch that verified markup for cosmetic gain with real regression risk,
right before a deploy carrying high-value new features. Decision: ship the features now;
schedule B1b/B1c as an isolated refactor PR with its own verification cycle. The shared
z-index tokens + 768px breakpoint already give the docks a consistent contract; only the
markup remains duplicated.

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
- 2026-06-07: B7 ship + production verification.
  - Commits `b57d67be → 171703bd` pushed to `origin/codex/gampo-polish-deploy` and fast-forwarded to `origin/main` (both at `171703bd`).
  - Netlify prod deploy live; live asset `assets/index-CBWeJj6H.js` (MATCH vs local dist).
  - Prod browser smoke: 0 overflow / 0 errors across `/ /sandbox /settings /insights /dice /poker /cases /sportsbook` on 390/492/1365.
  - Prod UX benchmark: ux=100 on all sampled routes/viewports.
  - Prod a11y audit: PASS (`/ /settings /insights /sandbox`).
  - Prod bet-sheet regression: PASS (roulette/keno/mines/limbo; blackjack skipped on load-timing race, verified locally).
  - B1b/B1c deferred with rationale (see above) — isolated refactor PR recommended next.

## What to reinforce next (post-features)
1. B1b shared `<GameTitleBar>` — extract Poker/Sportsbook titlebars into one primitive (isolated PR + verify).
2. B1c single mobile dock primitive — unify `bp-mobile-dock` / `slot-mobile-dock` / `sb-mobile-slip-pill` markup behind one component (z-index/breakpoint contract already shared).
3. Migrate the remaining hooks (`useProgress`, `useXp`, `useMissions`, `useGlobalPnl`, `useRewards`, `useCaseCollection`) onto `src/utils/storage.js` to delete duplicated read/write boilerplate.
4. [DONE] EV coach UI surface — now rendered in `StatsOverlay` (all 36 games) via `evCoach.js`.
5. Slots/Cases onto `BetPanel` — unify autoplay/stop-conditions/keyboard shortcuts.
6. [DONE] Responsible-play guardrails — `useSessionGuard` + `SessionGuardBanner` + Settings limits card.
7. Contrast audit with a real axe/contrast tool — current a11y audit covers names/labels/focus/errors, not WCAG contrast ratios.

## Follow-on shipped (post-features, 2026-06-07)
- EV coach in every game (reinforce #4): `StatsOverlay` now renders a theoretical-vs-observed verdict + plain-language note via the tested `evCoach.js`, reaching all 36 games through the shared aside. Test extended (3 pass).
- Responsible-play guardrails (reinforce #6): `useSessionGuard` (+test, 8 pass) — opt-in loss/wager/round/time limits + tilt (chasing) detection, fed from `useGameSession.record`. Surfaced via `SessionGuardBanner` (mounted in Layout) and a limits card in `/settings`. Informational only; nothing blocked.
- Verify: full suite PASS (340), build OK, local a11y PASS, bet-sheet PASS, ux=100 on sampled routes.

## Follow-on shipped (storage migration, 2026-06-07)
- Reinforce #3 DONE: migrated all 7 progression hooks (`useXp`, `useSidebarPins`, `useGlobalPnl`, `useProgress`, `useRewards`, `useMissions`, `useCaseCollection`) off hand-rolled try/catch read/write onto the shared `src/utils/storage.js` helpers (`readJson`/`writeJson`/`removeKey`). Zero direct `localStorage.*` calls remain in those hooks. Behavior preserved — full suite PASS (340).
- B1b/B1c reassessed and kept DEFERRED with strengthened rationale: Poker's titlebar (Hub link + title + balance) and Sportsbook's topbar (feed status + refresh, no Hub/balance) share no meaningful markup — only the visual recipe, already supplied by shared CSS tokens. A shared `<GameTitleBar>` would re-touch verified Poker/dock code for near-zero dedup. The three mobile docks already share the z-index + 768px breakpoint contract; only divergent markup remains. Net: not worth the regression risk; revisit only if a third consumer appears.
