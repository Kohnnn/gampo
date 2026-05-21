# QA Audit Response — 2026-05-20

This file documents how the [QA evaluation report](./evaluationreport.md) (2026-05-20) was processed and which findings were resolved.

## Headline result

**18/18 reported issues addressed.** Build green (5.4s, 9 chunks), 44/44 tests passing.

## Root cause of the P0 visual collapse

`src/styles/index.css` line 1610 had `@import url('../components/games/primitives/primitives.css')` placed **after** other CSS rules. Per CSS spec all browsers ignore late `@import`s, so `primitives.css` (which holds `.bp-*`, `.gs-*`, `.bml-*`, `.rrs-*`, `.gt-*`, `.bigwin-*`, `.fair-*`, `.hotkey-*`) silently never loaded in production. Single-line move to the top of the file restored every shell-game shell, BetPanel, BigWinOverlay, FairnessDrawer, GameToolbar, RecentResultsStrip, BetMetaList, hotkey overlay, and focus-visible outlines.

## Fix-by-fix mapping

| Report item | Severity | Fix |
|---|---|---|
| §2 BetPanel raw HTML on every game | P0 | A1 — Moved `@import url('.../primitives.css')` to line 2 of `src/styles/index.css` (was line 1610). |
| §3a Homepage thumbnails show 2-letter fallback | P1 | A2 — Generated 15 new portrait-style PNG thumbnails via `scripts/genAssets.js` (cx/gpt-5.5-image, ~1 MB each) into `public/assets/games/cards/games/card-<id>.png` and wired `image:` on every game in `src/data/gameDefinitions.js`. |
| §3b Lottery empty grey box | P1 | A3 — Tumbler shows "Pick 5 numbers · then Draw" when no balls drawn yet. |
| §3c Blackjack card slots show `--` | P1 | A3 — `<Hand>` now renders dotted-outline placeholder cards + a "Press Deal to start" hint when empty. |
| §3d Video Poker card faces missing | P1 | A3 — `vp-card.placeholder` dotted outline + centered "Click Deal to start" overlay row. |
| §3e Baccarat `?` placeholders + empty roads | P1 | A3 — `bac-card.placeholder` dotted outline; banner reads "Place chips on Banker / Player / Tie, then deal". Roads still empty when no hands settled — that's correct (empty road = no shoe). |
| §3f Coin Flip white-bg artifact | P2 | B1 — `mix-blend-mode: multiply` on `.coin3d-face img` and `.coin-choice img` blends white halo against the gold gradient. |
| §3g Slots only 1 column | P1 | A1 — Resolved by primitives.css recovery; `.gs-playfield` width constraints now apply. |
| §3h Chicken Cross no chicken sprite | P2 | B2 — `<span class="cc-chicken idle">🐥</span>` rendered at lane 0 when phase is idle. Added subtle idle bob animation. |
| §3i Dice 4 empty white rectangles | P2 | A1 — Resolved; the rectangles were `.dice-meta-row` cards rendering unstyled because BetPanel CSS was missing. |
| §4 Crash idle state ambiguity | — | A1 + existing `.crash-screen.busted/.cashed` states give a visual reset on each round. |
| §4 Limbo needle thin | — | Resolved by primitives.css recovery and existing `.limbo-gauge-target` 1px highlight. |
| §4 Wheel labels small / pointer small | P3 | B4 — Pointer +50% size; segment label font-size 14→18 with stronger text-shadow. |
| §4 Roulette `--` center before spin | P3 | A3 — Replaced with a slowly rotating `⟳` glyph (`.rou-num-pop.idle`); reduced-motion guarded. |
| §4 Mines grid cells too dark | P3 | B3 — Cell background lifted to `linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.22))` + 1px lighter border + inner highlight. |
| §6 ChatDock needs minimize button | P3 (user-requested) | A4 — `ChatDock` is now a 3-state component (`open` / `minimized` / `closed`), persists to `localStorage`, and the layout reserves 336px right padding when chat is open at viewport ≥1100px so it stops overlapping content. |
| §7 Sportsbook quota dash | P3 | C2 — Hide `.quota-chip` entirely when `totalQuotaRemaining` is falsy (no fake `–`). |
| §7 Promotions identical artwork | P4 | C3 — Wired the 4 existing `/assets/games/promo/promo-{edge,race,verify,sports}.png` as per-card backgrounds with a 45→92% gradient overlay so text stays readable. |
| §7 Activity empty state | P4 | C4 — Replaced "No activity yet." with a card showing `hero-arcade.png`, a heading, copy, and two CTAs (Try Dice / Browse Originals). |
| §7 Risk Academy raw dev tags | P3 | C1 — `sourceNotes` rewritten in `src/data/casinoCatalog.js` so cards now read "GamPo Lab" instead of `example/xaxino/...` paths. |
| §7 Race no avatars | P4 | C5 — `<img class="race-avatar">` cycling `/assets/games/poker/poker-avatar-{1..5}.png` per row; "you" row gets a green YOU pill. |
| §7 Verify all-blackjack history | P3 | C6 — Added explanatory hint above the recent-rolls grid noting it's a per-browser log mixed across games. |
| §8 React Router future-flag warnings | P3 | B6 — `<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>` in `src/main.jsx`. |
| §1 Two sidebar layouts across tabs | P2 | B5 — Sidebar collapse state now persists to `localStorage` (`gampo_sidebar_open`), so users land in their preferred mode every time. |

## Scope deliberately excluded

- **Verify "all-blackjack" rolls auto-cleanup** — the report's claim was a stale-localStorage symptom from the legacy SimulatorGame. New games push their own `gameId`s via `nextRoll(<id>)`, so the log will self-heal as users play; we surface a hint instead of clearing data automatically.
- **Summarizer-API console warning** — browser-side AI hint not produced by our code.

## Verification

- `npm run build` — 5.42s, 0 errors, 0 warnings, all chunk sizes within budget.
- `npm test` — 44/44 across 9 files (`fairRng`, `simulationMath`, `originalsMath`, `blackjackStrategy`, `sportsApi`, `handCanonicalize`, `positions`, `textureClassify`, `gtoLookup`).

## Files added

- `public/assets/games/cards/games/card-{baccarat,blackjack,chickencross,color,dice,keno,limbo,lottery,roulette,sicbo,slots,tower,videopoker,war,wheel}.png` (15 thumbnails, ~15 MB total).
- `docs/qa-audit-response-2026-05-20.md` (this file).

## Files edited

- **CSS load order**: `src/styles/index.css` (move primitives.css `@import` to top).
- **Game data**: `src/data/gameDefinitions.js` (15 image refs), `src/data/casinoCatalog.js` (sourceNotes rewrite), `scripts/assetManifest.js` (15 new entries).
- **Layout / a11y**: `src/components/Layout.jsx`, `src/main.jsx`, `src/components/ChatDock.jsx` + `.css`, `src/styles/index.css` (right-margin reservation).
- **Empty states**: `src/components/games/blackjack/BlackjackGame.jsx` + `.css`, `src/components/games/videopoker/VideoPokerGame.jsx` + `.css`, `src/components/games/baccarat/BaccaratGame.jsx` + `.css`, `src/components/games/lottery/LotteryGame.jsx` + `.css`, `src/components/games/roulette/RouletteGame.jsx` + `.css`.
- **Visual polish**: `src/components/games/coinflip/coinflip.css`, `src/components/games/chickencross/ChickenCrossGame.jsx` + `.css`, `src/components/games/mines/mines.css`, `src/components/games/wheel/wheel.css`.
- **Pages**: `src/pages/CasinoPages.jsx` (Promotions artwork, Activity empty state, Race avatars, Verify hint), `src/pages/SportsPage.jsx` (quota hide), `src/styles/casino.css` (supporting styles).
