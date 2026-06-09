# Mobile UI/UX benchmark follow-up — 2026-06-08

Response to `GamPo Mobile UI/UX Benchmark Report — 2026-06-08` (viewport 466×704).
Verdict in that report: NOT READY, blocked by P0 bet-sheet failure + 6 warns + "mobile
lacks many game cards (Cases, etc.)".

## TL;DR
- **F-1 (P0) was a false positive.** The bet sheet does NOT gate on `width < 450`; it uses
  the canonical `matchMedia('(max-width: 768px)')` breakpoint. The reported no-op tap was the
  **first-visit WelcomeModal** (`welcome-backdrop`/`welcome-card`/`welcome-cta`) intercepting
  taps on a fresh browser profile — the tester had not dismissed onboarding. Once onboarding
  is seeded-as-seen (the steady state for real returning users), the sheet opens and is
  hit-reachable on 390 / 466 / 492 px across all six games.
- All six warns + the discoverability gap are now fixed.
- One **genuine pre-existing regression** surfaced and was fixed: `/roulette` active bet-tab
  contrast was 2.54:1 (AA fail). It only failed now because prior contrast runs didn't include
  `/roulette`.

## Root-cause: F-1 bet sheet "won't open"
- `BetPanel.jsx:187` → `window.matchMedia('(max-width: 768px)')`; at 466px `isMobile` is true,
  dock + sheet render, z-order is scrim 1390 < dock 1400 < sheet 1410, pointer-events correct.
- `verifyBetSheet.mjs` previously: 390px only + synthetic `.click()` → bypassed real hit-testing,
  so it could pass while a real tap was intercepted.
- Hardened the verifier: parametrized `--viewports` (default `390x844,466x704,492x820`), real
  `elementFromPoint` hit-test of the toggle BEFORE dispatching a real pointer/click sequence, and
  pre-seed `gampo_onboarding_v1` (matching `browserSmoke.mjs`) so the WelcomeModal can't mask the
  dock. Result: PASS on all 3 widths × 6 games (`/dice /blackjack /roulette /keno /mines /limbo`).

## Discoverability (user: "all games should be visible in grids")
- **Poker was missing entirely** from `fullGameCatalog` (only `/poker` route + Live Studio link).
  Added a `poker` entry to `gameDefinitions.js` (category `Card room`, `/poker`, rtp 0.97,
  volatility "Skill dependent", reuses `video-poker.png` cover). It now appears in the HomePage
  main grid, the "Casino Tables" curated row, and `/originals`. `findGameDefinition` resolves it.
- **Cases** was in the catalog but pushed out of the curated "Originals" row by `.slice(0, 12)`.
  Raised curated-row caps 12 → 24 so no category entry is silently dropped. The main searchable
  `GameGrid` already renders the full filtered catalog (no cap), so Cases/Poker are reachable on
  mobile by drilling Games → grid (recommended option c — no 6th bottom-nav item, which would
  cramp at 390px). Verified at 466px: 51 cards rendered, Poker card present.

## Warns fixed
- **W-1 badge truncation**: removed fixed 76px first-chip basis (`casino.css`), switched
  `.casino-game-badges` to `flex-wrap: wrap`, and added a `VOLATILITY_ABBR` display map in
  `HomePage.jsx` ("Low to extreme" → "Low–Extreme", etc.). Full strings preserved in the chip
  `title` tooltip. Verified 0 clipped badges at 466px.
- **W-2 tab-bar overflow affordance**: added a right-edge mask-image fade (+ scroll-snap) to
  `.sb-subnav` (`sportsbook.css`) and `.collections-category-rail` (`CollectionsPage.css`).
- **W-3 roulette history chips**: `RecentResultsStrip.jsx` now abbreviates colour labels
  ("10 black" → "10 BLK") via exported `compactLabel`, instead of a blind 6-char slice. New
  regression test `RecentResultsStrip.test.js`.
- **W-4 crash presets**: `.crash-mobile-target-row` changed from a horizontally-scrolled row with
  a permanent mask (hid "25×"/"50×"/"100×") to a 5-col wrapping grid. Verified all 9 presets
  visible, "100×" present, no overflow at 466px.
- **W-5 slots reel clip**: tightened `.slot-reel-wrap` mobile min-height clamp (240/150 → 220/200)
  so the bottom reel row clears the fixed dock on initial load.
- **W-6 Tome of Life indicators**: added `@media (max-width: 466px)` 2×2 grid for `.tome-paytable`
  so SUN/MOON/STAR/SKULL chips stay legible.

## Pre-existing contrast fix
- `.bp-tab.active` used `color:#071109` on raw `var(--accent)` → 2.54:1 on roulette red `#f05252`.
  Changed to `color:#fff` on `color-mix(in srgb, var(--accent), black 50%)`. Verified ≥5.31:1 for
  every accent in use (computed across roulette/green/orange/blue/gold/red/purple). Contrast audit
  now PASS on all 12 routes tested.

## Verification (local, dist preview @127.0.0.1:4173)
- `vitest run`: **PASS (391)**, FAIL 0 (+3 new vs prior 388).
- `npm run build`: OK (expected lazy `rows-*` chunk-size warning only).
- `browserSmoke`: 0 overflow / 0 errors, action=yes across `/ /originals /slots-lobby /slots
  /poker /cases /sportsbook /collections /dice /roulette /crash /tomeoflife` × `390/466/492/1365`.
- `ux` benchmark: **ux=100** all routes/viewports; bet-sheet interaction=passed where applicable.
- `verifyBetSheet`: **ALL PASS** 390/466/492 × 6 games.
- `auditA11y`: PASS (0 issues) incl. `/poker`.
- `auditContrast`: PASS (0 AA issues) across 12 routes incl. `/roulette`.

## Files changed
- `scripts/verifyBetSheet.mjs` — multi-viewport, real hit-test, onboarding seed.
- `src/data/gameDefinitions.js` — Poker game definition.
- `src/pages/HomePage.jsx` — curated-row caps 12→24, `VOLATILITY_ABBR`, badge title.
- `src/styles/casino.css` — badge wrap, removed 76px basis.
- `src/components/games/primitives/RecentResultsStrip.jsx` (+`.test.js`) — colour abbreviation.
- `src/components/games/crash/crash.css` — preset grid.
- `src/styles/sportsbook.css`, `src/pages/CollectionsPage.css` — scroll fades.
- `src/components/games/slots/slots.css` — reel clamp.
- `src/components/games/tomeoflife/tomeoflife.css` — indicator grid.
- `src/components/games/primitives/primitives.css` — active bet-tab contrast.

## Deploy + production parity (DONE)
- Commits: `95538f2b` (mobile UI/UX follow-up) + `74240ae6` (Cases category-chip a11y names).
  Both pushed to `origin/codex/gampo-polish-deploy` and `origin/main`.
- GitHub auto-deploy did not fire within ~30min (prior session deploys published in minutes);
  deployed directly via authenticated Netlify CLI (`netlify deploy --prod --dir dist`).
- Live asset `index-DnADSfI3.js` MATCHES local `dist/index.html`.
- Production gates (https://gampo-educational-simulator.netlify.app):
  - smoke: 0 overflow / 0 errors across 12 routes × 390/466/492/1365.
  - ux: ux=100 all routes; only soft flag `/poker` interaction=failed @390px (SIT-DOWN buy-in
    modal, not a one-tap bet dock — pre-existing PokerGame behavior, passes @466px; not a hard gate).
  - bet-sheet: ALL PASS 390/466/492 × games.
  - a11y: PASS (0 issues) incl. `/cases` + `/collections` after chip fix.
  - contrast: PASS (0 AA issues) across 8 routes incl. `/roulette`.
- Verified at 466px: 51 cards, Poker card present, 0 clipped badges, 9 crash presets visible.

## Cases open-flow UX (excessive scrolling) — fixed
Reference: `https://case.oki.gg/case/glove-case/open` (reel-first focal layout).

Problem: in the "open" view the spinning reel/results rendered AFTER the selected-case banner,
room summary, opening timeline, category chips, market-reel preview, and the FULL case-selection
grid. On mobile the Open CTA lives in the top aside, so tapping it fired the reel animation at
~1982px down the page — players never saw it without manually scrolling.

Fix (`CasesGame.jsx` + `cases.css`):
- Wrapped the reel + results in a single `.cases-reel-area` block (`ref={reelAreaRef}`); it is
  `display:none` while empty and reorders ABOVE the case browser once tracks mount.
- CSS `order` on the flex stage: recent-results → selected-case → reel-area → stack-row →
  room-summary → timeline → category chips → market preview → case grid. The browser/selection
  controls now sit below the action instead of above it.
- Added a `useEffect` keyed on `tracks.length` that `scrollIntoView({block:'center'})` the reel
  area when a spin starts (reduced-motion aware), so the animation is always brought on-screen.

Result (measured via CDP, local + production):
- Reel top on spin: mobile 1982px → ~349px (390w) / ~289px (466w); desktop 407px. `reelInView:true`
  on all of 390/466/1365.
- Open → spin (in-view) → settle → results panel renders (1 card), `panelInView:true`, 0 errors.
- Smoke 0 overflow / 0 errors on `/cases /collections` × 390/466/492/1365; a11y PASS; vitest 391.
- Deployed `index-BkXoomPx.js` (matches local); production reel verified in-view mobile+desktop.

## Open follow-ups
- Netlify GitHub auto-deploy lag: push-triggered builds did not publish promptly; deployed via
  authenticated Netlify CLI (`netlify deploy --prod --dir dist`). Not blocking; production current.

## Core UX pass — shared scroll hook + Poker + Cases dock (2026-06-09)
Shipped `5bff9455` + `eb18028a`; deployed `index-DPeVKNsX.js` (matches local).

### Shared `useScrollActionIntoView` hook (`src/hooks/useScrollActionIntoView.js` +5 tests)
- Pure `resolveScrollPlan` core (testable) + thin effect wrapper; reduced-motion aware.
- Solves the "tapped but the change is off-screen" class of bug generically.
- Applied to Cases (reel) and Poker (action bar); ready to reuse on any below-fold action.

### Poker `/poker` @390px ux probe — FIXED
- Root cause was a harness timing race, not a layout bug: after sit-down the button is at seat 4
  of 6, so up to 5 bots act first at `BOT_THINK_MS=1100ms` before the human's turn; the old probe
  waited a fixed 900ms then asserted action buttons that only render on `isHumanTurn`. Flaky →
  failed @390px, passed @466px by luck.
- Fixes: (1) harness now polls up to ~8s for an enabled `[data-poker-action]` instead of a fixed
  sleep; (2) action bar (`.pk-actions`) scrolls into view via the shared hook when it becomes the
  player's turn (also a real mobile UX win — controls no longer stranded below the fold). The
  seated GTO-now panel already renders pre-turn with a "waiting on {actor}" state.
- Verified production: `/poker` interaction=passed @390 and @466 (was failing @390), ux=100.

### Cases sticky mobile open dock + collapsible browser
- Portaled `.cases-mobile-dock` to `<body>` (Quick · case summary · Open ×N), fixed at bottom on
  ≤768px using the shared `--z-mobile-action` / `--mobile-action-height` tokens; hidden on desktop
  where the right-panel CTA is kept. Replaces the in-aside sticky CTA on mobile (no double button).
  Stage `gs-playfield` gets bottom padding so content clears the dock.
- Added a "Change case / Hide case browser" collapse toggle so the open flow is reel→result rather
  than scrolling past the 60-card grid (grid hidden when collapsed; defaults open).
- Dock open button uses `data-cases-mobile-open` + `data-mobile-hit-target="primary"` (kept the
  canonical single `data-game-action` contract intact). Smoke gained a `/cases` interaction
  contract that opens via the dock and polls for the reel in-view.
- Verified: dock fixed + Open hit-reachable @390 (bottom 761px), desktop dock display:none with
  right CTA visible; production `/cases` interaction=passed @390/466, ux=100, a11y PASS.

### Gates (local + production)
- vitest 396 PASS (+5 hook tests); build OK.
- Local: smoke 0/0 across 12 routes × 390/466/492/1365; bet-sheet ALL PASS; contrast AA PASS;
  a11y PASS (after adding `aria-label` to `.cases-browser-toggle`, caught by the a11y guard).
- Production: `/poker` + `/cases` interaction=passed @390/466, ux=100, smoke 0/0, a11y PASS.

## Remaining follow-ups
- Apply `useScrollActionIntoView` to other below-fold actions if the pattern proves out (user to
  evaluate Cases/Poker first).
- Deferred phases from this brainstorm: Slots autoplay stop-condition parity in the mobile sheet;
  Arcade in-round CTA consistency sweep (mines/diamonds/snakes/tower cashout/again).
