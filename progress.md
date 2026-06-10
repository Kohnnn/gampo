Original prompt: Implement GamPo as an educational fake-credit casino and sportsbook probability simulator using the existing Vite React app, current four game engines, added simulator games, synthetic sportsbook, education panels, local practice credits, tests, and a real-money wording scan.

## Progress

- Replaced wallet storage/context with `CreditContext` and `gampo_*` localStorage keys.
- Added shared probability helpers and game definition data.
- Added a reusable education panel and simulator implementations for Dice, Limbo, Keno, Wheel, Roulette, Blackjack Trainer, and Slots.
- Rebuilt the hub as a searchable simulator workspace with practice-credit controls and recent simulation history.
- Added `/sports` with generated fixtures, odds movement, overround/vig, fair odds, EV, a practice ticket, and settlement history.
- Added education docks for the original Crash, Plinko, Mines, and Dino surfaces.
- Added Vitest coverage for pure probability/math helpers and scoped Vitest to app tests under `src`.
- Browser-smoked the hub, existing game routes, new game routes, and sportsbook; direct interactions verified Add Credits, Dice roll, sports market selection, and sports ticket settlement.
- Refactored the app into a fuller casino-style simulator shell using the example folder as reference: copied usable Xaxino play/game/banner assets into `public/example-assets`, added lobby sections for originals, slots, synthetic live tables, missions, VIP/risk learning, and activity.
- Added example-inspired arcade/card simulators for Coin Flip, Rock Paper Scissors, Guess Number, and Hi-Lo Cards with animated playfields, fake-credit settlement, and education panels.
- Browser-smoked the expanded routes and verified a live Coin Flip settlement plus mobile layout behavior.

## Current Focus

- 2026-05-20 — Stake/Rainbet 1:1 + GTO Poker rollout (see `docs/plan-2026-05.md`).
  - [x] Batch 1 — cross-cutting primitives (RecentResultsStrip, FairnessDrawer, GameToolbar, BetMetaList, BetPanel keyboard shortcuts, mobile + reduced-motion).
  - [x] Batch 2 — shell-game wiring (lastBet, snapshot bets, in-round CTA, Math.random→nextRoll, Limbo gauge, Sic Bo cells, console.log cleanup).
  - [x] Plan B v1 — Poker GTO preflop chart + tabbed sidebar (Chat | GTO | History) + bot preflop upgrade.
  - [x] Batch 3 — Crash → shell at `/crash`; legacy at `/crash-legacy`.
  - [x] Batch 4 — Mines → shell at `/mines`; legacy at `/mines-legacy`.
  - [x] Batch 5 — Plinko + Dino → shell at `/plinko` and `/dino`; legacy at `*-legacy`.
  - [x] Batch 6 — Blackjack extracted to `src/components/games/blackjack/BlackjackGame.jsx` at `/blackjack`. Legacy `*-legacy` routes retired, legacy game folders deleted, `antd` + `@ant-design/icons` + `ConfigProvider` removed.
  - [x] Plan B v2 — postflop textures + exploits + EV deltas (CO/MP/BTN-vs-BB plus BTN-vs-SB now ship all 6 textures; GTO vs Exploit EV row in panel).
  - [x] Poker hand history now snapshots hero stack at the start of each hand and derives accurate per-hand profit at showdown (final stack − snapshot).

## Notes (2026-05-20)

- All 44 tests pass (`npm test`); production build (`npm run build`) clean. Build time ~7s vs ~20s pre-rollout.
- New primitives shipped to `src/components/games/primitives/`: `RecentResultsStrip`, `FairnessDrawer`, `GameToolbar`, `BetMetaList`, `HotkeyHelp`. `GameShell` mounts `<GameToolbar/>` (Sound · Reduced-motion · Fullscreen · Fairness · Hotkeys · Help) as the default `titleBarExtras` for every game.
- `BetPanel` keyboard shortcuts active site-wide: Space = Play/Stop autobet/in-round CTA, S = Stop auto, R = Rebet, H = Half, D = Double, +/- = nudge bet, ? toggles the Hotkey overlay.
- Tower / Chicken Cross / Video Poker / Crash / Mines / Dino / Blackjack all use the `playPhase`/`playLabel`/`onPlayPhaseAction` props so the BetPanel CTA flips to the in-round action ("Cashout 2.40×", "Stand", etc.).
- Roulette / Baccarat / Sic Bo snapshot the chip layout into `lastChips`; Auto and Rebet replay the snapshot.
- Casino War uses a real shuffled shoe (Fisher-Yates over `nextRoll`); Baccarat shuffle replaced `Math.random()`.
- Limbo gauge reveals the actual `target` payout on win.
- Live Poker `/poker`: tabbed sidebar with **GTO** (13×13 grid + sizings + breakdown + exploits + EV delta), **History** (per-hand session via `useGameSession('poker')`), **Chat** (legacy, kept).
  - Engine `advanceStreet` pushes a `{type:'street', street}` history marker.
  - Bot preflop reads the same `/data/poker/preflop.json` the chart shows; postflop bot now also consults `postflop.json` to set c-bet frequency on matched textures.
  - Hero stack snapshot at hand start; profit at showdown = final − snapshot (multi-street accurate).
- Postflop chart data covers 6 textures × 4 matchups (BTN-vs-BB full + turn/river layer, CO-vs-BB, MP-vs-BB, BTN-vs-SB, SB-vs-BB) with default fallback. 3 exploit profiles each carry `evDelta` (gto vs exploit, in bb).
- Preflop chart includes RFI for UTG/MP/CO/BTN/SB plus BB defend ranges vs UTG/MP/CO/BTN open and a BTN response-vs-BB-3bet table.
- Antd, `@ant-design/icons`, `ConfigProvider`, the `antd-vendor` Vite chunk, and the legacy `*-legacy` routes are removed. Initial JS bundle dropped ~675 KB raw / ~213 KB gzipped.
- Tests added in `src/poker/__tests__/`: `handCanonicalize`, `positions`, `textureClassify`, `gtoLookup` (44 total).
- Stale `output/` smoke artifacts purged; `.gitignore` updated for `output/` and dev-server log files.

## QA Audit Response (2026-05-20)

External QA report at `docs/evaluationreport.md` flagged 18 issues. All 18 addressed in `docs/qa-audit-response-2026-05-20.md`. Headlines:

- **P0 fix**: `@import url('.../primitives.css')` was placed *after* CSS rules in `src/styles/index.css` so all browsers ignored it; primitives.css (BetPanel, GameShell, BigWinOverlay, FairnessDrawer, GameToolbar, RecentResultsStrip, hotkey overlay, focus-visible) silently never loaded. Moved import to line 2; one-line fix that visually resets the entire app.
- **15 new game thumbnails** generated via `scripts/genAssets.js` (cx/gpt-5.5-image) into `public/assets/games/cards/games/card-<id>.png` and wired into `gameDefinitions.js`. Homepage rows + `GameGrid` no longer fall back to 2-letter slices.
- **Pre-game empty states**: dotted-outline placeholders on Blackjack/Video Poker/Baccarat empty card slots; "Pick 5 numbers · then Draw" hint in Lottery tumbler; rotating `⟳` glyph in Roulette pop-out before first spin.
- **ChatDock**: 3-state (open/minimized/closed), persisted to localStorage; layout reserves 336px right padding at viewport ≥1100px when open so it never overlaps content.
- **Polish**: Coin Flip `mix-blend-mode: multiply` removes white halo; Chicken Cross idle chicken at lane 0 + responsive lane sizing; Mines cell contrast lifted; Wheel pointer +50% size, segment labels 14→18; Sidebar collapse persisted.
- **Router**: `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` added.
- **Long-tail**: Risk Academy dev-attribution tags rewritten as "GamPo Lab"; Sportsbook quota line hidden when blank; Promotions cards get per-card promo backgrounds; Activity empty state gets illustration + CTA; Race rows get poker-avatar PNGs cycled by index; Verify recent-rolls log gets an explanatory hint.
- Build 5.4s, 44/44 tests still green.

## Notes

- `npm install` reported dependency audit findings in the existing tree; no forced dependency upgrade was applied.
- `npm run build` succeeds but Vite warns that the bundle is large, mainly from the existing all-in app/game dependencies.

## Animation Restoration (2026-05-21)

Second QA audit (`docs/evaluationreport.md`) flagged that the four originals (Plinko, Crash, Mines, Dino) had lost their 1:1 Stake-style animations — pegs were divs, the rocket was a CSS gradient, the dino was a 🦖 emoji, mines were ✨/💣 emojis. Plan + fix-by-fix sit in `docs/animation-restoration-2026-05-21.md`.

### What shipped
- **Plinko** — Real canvas physics (`src/components/games/plinko/engine/{Ball.js, PlinkoEngine.js, constants.js, plinkoOutcomes.js}`) ported from `example/stake-originals-clone`. RNG bridged through `nextRoll('plinko')` to keep provably-fair drift away. Dynamic `import()` keeps the 18 MB outcomes table in its own chunk (`PlinkoEngine-*.js`). Ball selector with 6 coin variants from `/images/coins/coin_*.svg`. Authentic Stake bin payout table.
- **Crash** — `CrashChart.jsx` canvas chart with DPI handling, ResizeObserver, gradient stroke, axis labels. Rocket sprite (`/images/spaceship.png`), exhaust GIF (`/images/exhaust/exhaust02_preview.gif`), explosion GIF (`/images/explosions/normal_explosion.gif`) overlay during a round. Idle ghost-curve loop. Lightweight simulated player strip (~5 fake cashouts/bets per round).
- **Mines** — Real bomb/diamond SVGs (`/images/mines/bomb.svg`, `diamond.svg`), explosion overlay (`bomb_effect.gif`), CSS 3D flip-on-reveal (220ms `rotateY` with `backface-visibility`). Hover lift + brighter idle border per eval P3 #12.
- **Dino** — Lightweight canvas engine (`src/components/games/dino/engine/{DinoEngine.js, atlas.js}`) drawing the existing Chrome-dino atlas at `public/dino-assets/sprites/dino-atlas.png`. Run/idle/duck cycles, parallax ground, cactus + pterodactyl obstacles, gravity + jump physics, idle demo loop. No Phaser dependency.

### Eval-report polish (Phase 5)
- **Cards** — Shared `<CardFace />` and `<CardBack />` (`src/components/ui/CardFace.jsx` + `card-face.css`). Wired into Blackjack, Video Poker, Baccarat, Casino War. Pre-deal slots show face-down backs instead of empty rectangles.
- **Slots** — Idle grid pre-fills with non-blank theme symbols + a 4.5s shimmer pass on every cell; reels stop animating shimmer when spinning.
- **Lottery** — CSS-rendered drum (rotating dashed circle with 4 ghost balls, counter-rotating hint label) sits in the tumbler when idle.
- **Dice** — Last-4 rolls render as colored result pips above the slider (eval 2f).
- **Roulette / RPS** — Decorative gradient backgrounds scoped via `contain: layout paint` + `overflow: hidden` so they never bleed past the panel (eval 3 / Roulette + RPS).
- **Chicken Cross** — Lane container `overflow-x: hidden`, lanes flex-grow + scrollbar hidden, no more horizontal scrollbar.
- **Wheel** — 32s idle slow rotation when not spinning, last-result chip preserved.
- **Tower** — Idle gradient + 1px border bump for visual depth on every tile, hover state for current row.
- **Coin Flip** — 7s idle Y-axis rotation when not flipping.
- **Chat** — Sidebar Casino section gains an "Open Chat" action that dispatches `gampo:open-chat`. `ChatDock` listens and pops open from any page (eval 4).

### Verification
- `npm run build` clean, 10.4s. Main entry chunk unchanged at 79 KB; Plinko outcomes table split into `PlinkoEngine-*.js` (18 MB raw / 7.9 MB gzip), only loaded on `/plinko`.
- `npm test` 61/61 passing. Added 4 engine tests:
  - `src/components/games/plinko/plinko.engine.test.js` — Galton bin distribution sanity.
  - `src/components/games/crash/crash.math.test.js` — bust distribution + house-edge floor.
  - `src/components/games/mines/mines.flip.test.js` — multiplier ladder monotonicity + 1% edge.
  - `src/components/games/dino/dino.engine.test.js` — survival roll + growth multiplier contracts.

### Files added
- `src/components/games/plinko/engine/{Ball.js, PlinkoEngine.js, constants.js, plinkoOutcomes.js}`
- `src/components/games/crash/{CrashChart.jsx, PlayerStrip.jsx}`
- `src/components/games/dino/engine/{DinoEngine.js, atlas.js}`
- `src/components/ui/{CardFace.jsx, card-face.css}`
- `src/components/games/{plinko,crash,mines,dino}/*.test.js`
- `docs/animation-restoration-2026-05-21.md`

### Files modified
- `src/components/games/{plinko,crash,mines,dino}/{*.jsx,*.css}` — full rewrites for the 4 originals.
- `src/components/games/{blackjack,videopoker,baccarat,war}/*.jsx` + matching CSS — CardFace integration.
- `src/components/games/{slots,lottery,dice,roulette,rps,chickencross,wheel,tower,coinflip}/*.css` — eval polish.
- `src/components/Sidebar.jsx`, `src/components/ChatDock.jsx` — chat trigger.
- `src/styles/index.css` — `card-face.css` import.
- `progress.md` — this section.

## QA v3 Response (2026-05-21)

Third QA audit (`docs/evaluationreport.md` v3) flagged 2 false-positive "P0 crashes", 2 P1 placeholders, several P2 polish items, plus user-driven asks: kill the 336px right gutter, add PnL Stats next to Race in the chat dock, allow uncapped Plinko multi-ball with per-ball coin art, improve gameplay feel, and give every game a unique sidebar icon.

### Phase A — Route safety
- "Casino War /casinowar blank screen" and "Color Pick /colorpick blank screen" diagnosed as URL-mismatch (real routes are `/war` and `/color`). Added `<Navigate>` aliases in `src/App.jsx` plus a `*` catch-all that renders `NotFoundPage`.
- New `<ErrorBoundary>` wraps every lazy-loaded game route so a future runtime exception fails soft instead of blanking the layout.
- New components: `src/components/NotFoundPage.jsx`, `src/components/ErrorBoundary.jsx`, plus `.not-found` / `.route-error` styles.

### Phase B — Layout + ChatDock + Stats panel
- Removed `html.chat-open .main-content { padding-right: 336px }` rule from `src/styles/index.css`. ChatDock is now a true floating overlay; main content uses full width.
- ChatDock width adapts per tab: 320 / 360 / 380px for Chat / Race / Stats; backdrop-blur and stronger shadow. Send button enlarged with green gradient + 32px hit target.
- New Stats tab driven by `src/hooks/useGlobalPnl.js` (session / game / all-time scopes; 500-entry rolling localStorage history; module-scope listener pattern so any consumer sees the same numbers).
- New `src/components/StatsPanel.jsx` mirrors the Live Stats widget from `example/stake-originals-clone` (profit-box + Chart.js profit history line). Chart.js loads via dynamic import so it stays in its own 207 KB chunk.
- ChatDock now shows an unread badge (`chat-dock-unread`) when minimized or on a non-chat tab. Sidebar gains a "PnL Stats" action button that dispatches `gampo:open-chat` with `tab: 'stats'`.

### Phase C — Sic Bo + Baccarat
- New `src/components/games/sicbo/SicBoDie.jsx` + `SicBoDie.css` rendering authentic pip faces (3×3 grid, Unicode-die layout). Replaces the bare-digit and `?` placeholders flagged in eval 3a.
- Baccarat `outcomes` state now hydrates from `session.history` on mount (filters records with `meta.outcome`, reverses to oldest-first). Fixes "29 bets in history but Big Road empty" finding.
- Baccarat shuffle and shoe API unchanged; only the `useState` initialiser changed.

### Phase D — Plinko uncapped multi-ball
- `engine/PlinkoEngine.js`: `dropBall(binIndex, ballType, opts)` now accepts per-ball `{color, image}`, threads them into the `Ball` constructor, and emits `ballId` on every `onBallEnterBin` event.
- `PlinkoGame.jsx`: dropped the `running` gate; rapid-fire spam is allowed. Settle map keyed by ball-id resolves each promise independently. Concurrent Sapphire / Ruby / Emerald / Bronze drops each keep their own coin art.
- `BetPanel.runningRound` only blocks while the engine is loading; an "In flight" counter shows active drops.

### Phase E — Polish
- Mines grid: `min-width: 320px`, `min-height: 320px`, `max-width: 480px`, gap 8 → 10 px, padding 16 → 18 px (eval 3d).
- Dice last-4 pips strip is hidden until `session.history.length > 0` (eval 3c).
- Wheel segment labels 18 → 22 px with stronger text shadow.
- Sidebar: every game now has a unique stroked SVG glyph (Crash, Plinko, Dino, Mines, Dice, Limbo, Keno, Wheel, Roulette, Blackjack, Baccarat, War, Sic Bo, Video Poker, Color, Tower, Chicken Cross, Lottery, Slots, Coin Flip, RPS, Guess, Hi-Lo, Poker). Casino navItems also gain unique icons (Lobby, Originals, Slots Lobby, Live, Sportsbook, Promotions, Missions, VIP, Risk Academy, Verify, Race, Activity).
- Sidebar already supported full ↔ icon-only collapse via `app-sidebar-hidden`; now every nav item also carries a `title` so the icon-only mode shows tooltips.

### Phase F — Game feel
- New `src/utils/tremor.js` exporting `useTremor()` + `triggerTremor(ref, size)` and `gampo-shake` / `gampo-shake-lg` keyframes in `src/styles/index.css`.
- **Crash**: per-0.1× tick audio while running; large `gampo-shake-lg` on bust and on cashed-out at ≥5×. (`crash-screen` ref tracked via `useTremor`.)
- **Mines**: `Particles count={8} color="#9bf08a"` per safe diamond reveal in addition to the existing `count={22}` cashout burst.
- **Dino**: parallax cloud layer scrolling at 0.4× ground speed; motion-blur trail (2 ghost frames) when airborne during a real run.
- **Slots**: anticipation slowdown — when 2 settled columns share a paying symbol on any payline, remaining columns extend by 480 ms (Stake/Pragmatic-style suspense).

### Phase G — P4 long tail
- Promotions cards now carry a unique gradient + emoji marker per promo (📊 EV 101, 🏁 Race Week, 🔒 Verify, ⚽ Sportsbook EV). New `.promotion-emoji` style in `src/styles/casino.css`.

### Verification
- `npm run build` clean (10.8s). Main entry 89 KB / 27 KB gzip; chart-*.js split into 207 KB / 71 KB gzip; PlinkoEngine 18 MB chunk only on `/plinko`.
- `npm test` 72/72 passing. Added 3 new tests:
  - `src/hooks/useGlobalPnl.test.js` — record/reset + alltime persistence.
  - `src/components/games/sicbo/sicbo.die.test.js` — pip layout per face.
  - `src/components/games/plinko/plinko.multiball.test.js` — settle map keyed by ballId resolves 50 in-flight balls without contention.

### Files added
- `src/components/{NotFoundPage.jsx, ErrorBoundary.jsx, StatsPanel.jsx}`
- `src/components/games/sicbo/{SicBoDie.jsx, SicBoDie.css}`
- `src/hooks/useGlobalPnl.js`
- `src/utils/tremor.js`
- `src/hooks/useGlobalPnl.test.js`
- `src/components/games/sicbo/sicbo.die.test.js`
- `src/components/games/plinko/plinko.multiball.test.js`
- `docs/qa-v3-response-2026-05-21.md`

### Files modified
- `src/App.jsx` — aliases (`casinowar` → `/war`, `colorpick` → `/color`), `*` catch-all, ErrorBoundary.
- `src/styles/index.css` — gutter rule swapped to `padding-right: 0`; tremor keyframes; not-found/route-error styles.
- `src/components/Sidebar.jsx` — unique per-game SVG icons; PnL Stats action.
- `src/components/ChatDock.jsx` + `ChatDock.css` — Stats tab; unread badge; widened panel; better send button; race-tab `aria-pressed`; chat icon swap.
- `src/components/games/primitives/useGameSession.js` — mirrors every recorded round to `recordPnl()` for the global aggregator.
- `src/components/games/sicbo/SicBoGame.jsx` — uses `<SicBoDie/>` instead of bare digits.
- `src/components/games/baccarat/BaccaratGame.jsx` — `outcomes` hydrates from session history.
- `src/components/games/plinko/{PlinkoGame.jsx, engine/PlinkoEngine.js}` — uncapped multi-ball, per-ball image, ball-id settle map.
- `src/components/games/mines/{MinesGame.jsx, mines.css}` — sparkle on every safe reveal; grid sizing.
- `src/components/games/dice/DiceGame.jsx` — pip strip gated on first-roll history.
- `src/components/games/wheel/wheel.css` — segment labels 22 px.
- `src/components/games/crash/CrashGame.jsx` — tremor on bust/big cashout; per-0.1× tick audio.
- `src/components/games/slots/SlotsGame.jsx` — anticipation slowdown when 2/3 columns share a paying symbol.
- `src/components/games/dino/engine/DinoEngine.js` — parallax clouds + motion-blur trail.
- `src/pages/CasinoPages.jsx` — promo card gradient + emoji per item.
- `src/styles/casino.css` — `.promotion-emoji` style.
- `progress.md` — this section.

## QA v4 Response (2026-05-21)

Fourth audit (`docs/evaluationreport.md` v4) plus three user concerns — Plinko autoplay should drop multiple balls at ~0.5s, poker stalls after one raise, and "freezes mid-round" across many games. Plan + risk notes in `docs/qa-v4-response-2026-05-21.md`.

### Phase A — Universal freeze prevention
- New `src/utils/scheduling.js` with `useCancellableTimeouts()` and `withTimeout(promise, ms)`.
- BetPanel autoplay loop wraps each `await onPlay(...)` in `withTimeout`. A round that doesn't resolve within `autoTimeoutMs` (default 15s, Plinko 6s) stops the loop with a console warning. Replaces the old fixed 120ms breather with a configurable `autoIntervalMs`.
- Mines / Crash / Dino / Chicken Cross / Tower / Casino War / Sic Bo replaced `window.setTimeout(() => setPhase('idle'), N)` with the cancellable hook so a new round always cancels pending phase resets.
- Crash adds a `visibilitychange` recovery: when the tab returns mid-round, recompute the live multiplier and finalise to bust if wall-clock crossed the bust point. Stops the "round stuck while tab backgrounded" stall.

### Phase B — Poker
- Bot scheduler refactor in `PokerGame.jsx`: each turn schedules a `decideTimer` (700ms think) plus a parallel `escapeTimer` (5s force-fold safety net) instead of the single shared `stepTimer.current` that was getting clobbered on every state change.
- Watchdog: when `state.toAct < 0` and `state.street !== 'showdown'`, dispatch a benign `{ type: 'check' }` action 250ms later to kick the engine.
- `Game.advanceStreet` now recurses through streets to showdown when `nextActiveIndex` returns -1 (e.g. all-in run-out). New test `src/poker/engine/Game.watchdog.test.js`.
- GTO chart upgrade: `GtoPanel.jsx` adds a "Suggested" callout (raise/call/fold tone with frequency mini-bars), a hand search input that dims non-matching cells, a colour legend, and the Sizings list now renders a coloured frequency bar. New CSS in `PokerGame.css`.

### Phase C — Plinko
- Engine gravity `0.5–0.6` → `0.85–1.1` per row count so balls fall noticeably faster.
- Engine drains orphan resolvers when `updateRowCount` runs mid-flight: each in-flight ball gets a synthetic `{ cancelled: true }` event so React-side promises never dangle.
- `PlinkoGame.performPlay` short-circuits when `mode === 'auto'`: resolves immediately so the BetPanel loop ticks at its 500ms cadence instead of waiting for the ball to land. Settlement still runs async via the per-ball settle map.
- BetPanel `autoIntervalMs={500}` + `autoTimeoutMs={6000}` for Plinko.
- New "Quick drop" buttons (+5 / +10 / +25) in the Plinko BetPanel that schedule sequential drops at 500ms each, regardless of the autoplay tab.

### Phase C+ — Crash
- Canvas `min-height` 360 → 480 px (520 desktop / 600 wide-screen).
- Multiplier number 96 → 120 px on desktop, 84 px on small screens.
- New CSS-only twinkling starfield behind the curve via `.crash-screen::before`.
- Simulated crowd grows from 4–6 to 8–12 players with a long-tail target distribution (most cash 1.3×–4×, a few moonshots up to 33×). Strip max-height 132 → 188 px.

### Phase D — v4 eval polish
- **Sic Bo**: `revealed` defaults to `[true, true, true]` so a real pip face shows pre-roll instead of `?` placeholders.
- **Dice**: pip strip is always rendered; empty slots show muted `?` chips so the strip never reads broken.
- **Hi-Lo**: added `<Route path="hilocards" element={<Navigate to="/hilo" replace />} />`.
- **Stats panel empty state**: `StatsPanel.jsx` overlays "Play a round to see your profit curve" when the active scope has zero entries.
- **Color Pick** background bleed: `contain: layout paint` + `overflow: hidden` on `.color-stage`.
- **Wheel** segment labels 22 → 26 px with stronger text shadow.
- **Chat** input placeholder: "Type to simulate..." → "Say something...".

### Verification
- `npm run build` clean (9.8s). Main entry 89 KB / 27 KB gzip; chart split 207 KB / 71 KB gzip; Plinko engine 18 MB only on `/plinko`.
- `npm test` 79/79 passing (was 72; added 7 new tests across `scheduling` + `Game.watchdog`).

### Files added
- `src/utils/scheduling.js`
- `src/utils/scheduling.test.js`
- `src/poker/engine/Game.watchdog.test.js`
- `docs/qa-v4-response-2026-05-21.md`

### Files modified
- `src/App.jsx` — `hilocards` alias.
- `src/components/games/primitives/BetPanel.jsx` — `withTimeout` wrap, configurable interval/timeout.
- `src/components/games/{mines,dino,chickencross,tower,war,sicbo}/...jsx` — cancellable phase timeouts.
- `src/components/games/crash/{CrashGame.jsx, crash.css}` — visibility recovery, bigger canvas, starfield, beefier sim crowd.
- `src/components/games/plinko/{PlinkoGame.jsx, engine/PlinkoEngine.js}` — faster physics, autoplay short-circuit, orphan drain, Quick drop UI.
- `src/components/games/sicbo/SicBoGame.jsx` — pre-roll dice revealed by default + cancellable timeouts.
- `src/components/games/dice/DiceGame.jsx` — pip strip always visible with muted `?` chips.
- `src/components/games/wheel/wheel.css` — segment labels 26 px.
- `src/components/games/color/color.css` — paint containment.
- `src/components/PokerGame/PokerGame.jsx` — bot scheduler refactor, watchdog, escape hatch.
- `src/components/PokerGame/GtoPanel.jsx` — suggested action, hand search, sizings bar.
- `src/components/PokerGame/PokerGame.css` — new GTO upgrade styles.
- `src/poker/engine/Game.js` — `advanceStreet` recursion when no live actor.
- `src/components/StatsPanel.jsx` + `ChatDock.css` — empty-state overlay.
- `src/components/ChatDock.jsx` — chat placeholder copy.
- `progress.md` — this section.

## Stake/Rainbet Wave 33 Gap 1 (2026-05-25)

- Added shared sim-player row generation in `src/components/games/primitives/simBetRows.js`, reusing the Social roster/personas and deterministic `createRoundRng` seeds.
- Added `<SimBetStrip />` and wired it into Mines, Dice, Plinko, Limbo, Wheel, and Keno so each settled user round prepends one capped social row.
- Added `simBetRows.test.js` coverage for persona stake/target bias and 8-12 row capping.
- Verification: `npm test -- --run` is green at 127 tests across 27 files; `npm run build` is clean in 14.87s with the existing empty-chunk / large Plinko row warnings. Browser smoke checked `/dice` desktop with one played round, persona-varied `/dice` rows after the final bias adjustment, all six strip routes for initial rows, and `/mines` at 390x844.

## Stake/Rainbet Wave 34 Gap 2 (2026-05-25)

- Upgraded `src/poker/bots/HeuristicBot.js` with persona profiles for tight-passive, loose-aggressive, whale, cautious, and analyst bot styles.
- Added deterministic bot RNG hooks, per-persona VPIP/PFR/c-bet/fold-to-3-bet/river-bluff biasing, and low-SPR postflop equity sampling at 250 rollouts.
- Added a soft postflop GTO anchor that consumes already-loaded `/data/poker/postflop.json` texture frequencies without letting the bot fetch chart data directly.
- Preserved `persona` / `pokerStyle` metadata in `Game.js`, assigned styles in `PokerGame.jsx`, and passed the loaded postflop chart into bot decisions.
- Added `HeuristicBot.test.js` coverage for deterministic action distributions, river bluff bands, sample-count selection, and GTO anchoring; extended `Game.watchdog.test.js` for persona metadata.
- Verification: focused poker tests are green at 14 tests across 3 files; `npm test -- --run` is green at 133 tests across 28 files; `npm run build` is clean in 9.37s with the existing empty-chunk / large row warnings. Browser smoke checked `/poker` at 1440x900 through a seated practice table and populated GTO panel.

## Stake/Rainbet Wave 35 Gap 3 (2026-05-26)

- Added `src/components/games/cases/casesAnimation.js` to centralize reveal timings, target prize offset math, phase labels, and celebration-drop selection.
- Refactored `CasesGame.jsx` around explicit lid/spinning/finale/zoom/settling phases with one guarded settlement path for both natural reveals and skipped reveals.
- Added a desktop/mobile-safe `Skip animation` control that immediately settles the same pending practice round while preserving drop, balance, session, PnL, and history records.
- Added CSS-only lid lift, reel light sweep, target prize zoom, center prize popover, and reduced-motion fallbacks in `cases.css`.
- Added `casesAnimation.test.js` coverage for offset math, phase labels, Restricted+ celebration thresholds, and strongest-drop selection.
- Verification: focused cases tests are green at 11 tests across 2 files; `npm test -- --run` is green at 137 tests across 29 files; `npm run build` is clean in 9.12s with the existing empty-chunk / large row warnings. Browser smoke checked `/cases` at 1440x900 for lid phase, natural settle, skipped settle, and clean console, plus `/cases` at 390x844 for no horizontal overflow.

## Stake/Rainbet Wave 36 Gap 4 (2026-05-26)

- Added `src/components/games/slots/slotsMotion.js` to centralize slot bonus motion timings and pure helpers for hold tile freshness, cell centers, retrigger flyers, and cascade traces.
- Extended `slotFactory.js` hold-and-respin feature events with `startFilledIndexes`, `filledIndexes`, and `newFillIndexes` so the UI can pulse only newly landed hold tiles.
- Wired `SlotsGame.jsx` to render transient retrigger flyers from scatter cells, cascade trace dots over winning cells, and shared hold tile state from the helper layer.
- Added CSS-only wheel landing wobble, hold new-fill pulse, retrigger fly-in chips, cascade trace dots, and reduced-motion fallbacks in `slots.css`.
- Added `slotsMotion.test.js` coverage for helper state, uniform/megaways cell centers, retrigger coordinates, cascade capping, and exported timing constants.
- Verification: focused slot tests are green at 17 tests across 2 files; `npm test -- --run` is green at 143 tests across 30 files; `npm run build` is clean in 13.93s with the existing empty-chunk / large row warnings. Browser smoke checked `/slots` at 1440x900 for Iron Fist wheel/free-spin bonus motion and `/slots` at 390x844 for no horizontal overflow.

## Stake/Rainbet Wave 37 Gap 5 (2026-05-26)

- Added phone-safe slot bonus overlay sizing in `slots.css`, including smaller wheel disc padding and a five-column hold board so wheel/hold overlays stay inside the reel frame at 375px.
- Updated `ChatDock.jsx` and `ChatDock.css` so dock tabs keep the Stats / Progress / Chat / Race order but hide labels when the mobile dock width drops below 360px.
- Added reusable cases rarity filter options plus a mobile rarity button group, while keeping the native select behavior on larger screens.
- Forced the cases Pokedex collection grid to two columns at 480px and kept the Pokedex sort select visible beside the compact rarity controls.
- Added a small-phone GameToolbar portal override so the tools menu remains portalled but anchors to the viewport bottom-right instead of clipping from the trigger.
- Verification: `npm test -- --run` is green at 143 tests across 30 files; `npm run build` is clean in 12.59s with the existing empty-chunk / large row warnings. Browser smoke checked `/slots` at 375x667 for overlay and tools-popover metrics, `/cases` at 480x844 for two-column Pokedex + rarity buttons, and `/cases` at 320x667 for icon-only ChatDock tabs.

## Stake/Rainbet Wave 38 Gap 6 (2026-05-26)

- Added Roulette idle wheel motion with spinning/idle classes and a reduced-motion fallback.
- Added Blackjack chip-slide feedback when a hand is dealt, plus phone-sized Hit / Stand primary actions.
- Added Lottery post-draw settling wobble and broader reduced-motion coverage.
- Added Tower staggered ladder reveal pulses after safe climbs.
- Added Chicken Cross lane fade-out/fade-in motion after safe crossings.
- Added Video Poker hold-toggle pulse motion for held and unheld cards.
- Verification: `npm test -- --run` is green at 143 tests across 30 files; `npm run build` is clean in 8.22s with the existing empty-chunk / large row warnings. Browser smoke checked `/roulette`, `/blackjack` desktop/mobile, `/lottery`, `/tower`, `/chickencross`, and `/videopoker`, including the new motion selectors and no horizontal overflow.

## GamPo Quality Overhaul (2026-05-29)

- Reworked Cases into a product-style opener: category browsing, larger selected-case hero, card EV/volatility/rare previews, stronger reel/result reveal, and collection value/discovery summaries without Pokedex copy.
- Normalized slot presentation with larger reels, distinct template skins, stripped rank-art backgrounds, no `slot-classic` fallbacks after `applyRankArt()`, and QA-forceable bonus feedback for free spins, retriggers, hold/respin, wheel, cascade, and meter collection.
- Tightened Poker/GTO scroll behavior so table actions remain reachable at desktop/tablet sizes and the GTO decision/detail area stays usable above the grid with an independently scrolling sidebar.
- Added an audio audit report covering manifest refs, unused WAVs, procedural-loop weakness, and replacement candidates with source/license notes; no external audio was ingested.
- Verification: `npm test -- --run` is green at 174 tests across 40 files; `npm run build` passes with the existing empty `phaser`/`matter` chunks and large poker-row chunk warnings. Browser smoke captured `/cases`, `/vault-rush`, `/river-catcher`, `/dust-rail`, `/storm-banner`, `/bassline-bonus`, `/phoenix-megaways`, and `/poker` at 375x667, 480x800, 1024x768, and 1610x870 with no horizontal overflow or broken images, plus interaction checks for case opening and forced slot bonus state.

## GamPo Card Tables Polish (2026-05-31)

- Added shared game education copy through `src/data/gameEducation.js` and expanded the in-game education panel with how-to-play, payout model, decision cue, and risk note content.
- Improved Poker, Roulette, Baccarat, and Blackjack table readability with clearer status strips, action context, ticket/result summaries, winner/highlight states, and desktop/mobile layout tuning.
- Rebuilt Tarot around a 22-card generated deck model with deterministic no-replacement spread draws, normalized 96% RTP per suit, generated SVG card fronts/backs, and clearer suit EV/top-card guidance.
- Added `tarotModel.test.js` coverage for no-replacement draws, suit EV normalization, and matching-suit contribution boosts.
- Verification: `npm test -- --run` is green at 178 tests across 41 files; `npm run build` passes with the existing empty `phaser`/`matter` chunks and large `rows-*` chunk warnings. Browser smoke `round3-card-tables-verified` checked `/poker`, `/roulette`, `/baccarat`, `/blackjack`, and `/tarot` at 375x667, 480x800, 1024x768, and 1610x870 with no horizontal overflow, no console errors, no broken images, and key actions visible.

## Card Games Fix + Tarot Asset Pass (2026-05-31)

- Hardened Cases with a stable `case-open` CTA selector, phone-first CTA ordering, exactly-once settlement guard, 1/5/10-row settlement summaries, and readable landed reels/results after skip or natural settle.
- Added Roulette coverage mapping from `makeBet(...)` so straight, outside, column/dozen, and racetrack bets mark every covered board cell, with distinct straight chips, advanced coverage badges, spin phases, ball drop motion, pocket glow, and reduced-motion fallbacks.
- Reworked Blackjack into multi-hand state with Split, split-aces auto-stand, max four hands, double-after-split except split aces, original-hand surrender, and settlement rules for original natural blackjack vs split 21.
- Updated Baccarat roads to tail-window the newest Big Road/derived-road outcomes, pulse latest cells, and render ties attached to the current road cell.
- Replaced generated Tarot SVG cards with the supplied monochrome Major Arcana PNG pack under `public/assets/tarot/monochrome`, keeping the 22-card 96% RTP model and pixel-art card presentation.
- Added targeted tests for Cases settlement summaries/guard, Roulette coverage, Blackjack split rules, Baccarat road tail/latest/tie behavior, and Tarot asset path mapping.
- Verification: `npm test -- --run` is green at 193 tests across 44 files; `npm run build` passes with the existing empty `phaser`/`matter` chunks and large `rows-*` chunk warnings. Browser smoke `cardfix-after-final` checked `/cases`, `/roulette`, `/blackjack`, `/baccarat`, and `/tarot` at 375x667, 480x800, 1024x768, and 1610x870 with no horizontal overflow, no console errors, no broken images, and key actions visible. Interaction checks covered 5-row Cases skip, Roulette straight+advanced spin, repeated Baccarat road latest markers, Tarot PNG reveal, and Blackjack deal UI with Split visible.

## QA v4 Mobile Audit Response (2026-06-05)

External "QA Update Report v4" (June 5) flagged P0 hit-box failures (all footer DEAL/SPIN/DRAW buttons dead), split slot reels, and a non-functional Poker Sit Down. **Cross-checked every claim against the live deploy and source; the P0 claims are false positives against the shipped build.**

### Root-cause finding: report tested against a misread of a current build
- Confirmed the live Netlify deploy entry bundle (`index-5RedBb1Q.js`) is byte-identical to the local `dist/` built from HEAD `bb250ae4` — the deploy is current, not stale.
- The recommended fix (mount the footer via `React.createPortal()` at `document.body`) was already shipped in a prior wave (`BetPanel.jsx` `createPortal(mobileDock, document.body)`, `primitives.css` dock at `z-index: 1400`).
- Live interaction tests disproved the P0s: Blackjack DEAL dealt a hand (balance 1000→995, footer flipped to Stand); `elementFromPoint` at the button's visual center returns the button itself (no hit-box offset); Poker Sit Down was merely **disabled by the balance gate** (GC 995 < GC 1,000 min buy-in) — topping up enabled it and seating worked; Slots renders a clean single 5×4 grid with no overflow.

### Real issues found and fixed
- **Roulette bet-table discoverability (M2) + wheel crop (M3)**: the mobile compaction (shrink wheel to 180px, hide live/feed/ticket side panels) only triggered at `max-width: 480px`, but the layout went single-column at `720px`. At the report's ~492px the full-size wheel + 3 stacked panels pushed the felt to y≈1301 (below the fold). Aligned the compaction block to `max-width: 760px` (board now at y≈551, within fold) and added a persistent `.rou-bet-jump` "Place your bets · Tap the felt ↓" anchor to `#roulette-bet-board` with `scroll-margin-top` and a reduced-motion fallback.
- **Slots duplicate Spin (new)**: phones showed two visible spins — the in-flow `slot-panel-spin` (promoted with `order:-1`) competing with the fixed `slot-mobile-dock` spin. Hid `slot-panel-spin` at `≤760px` so the fixed dock owns the single primary CTA; the side panel keeps template/bet/buy controls.
- **Footer action-dock clarity (user-requested centerpiece) + selector discoverability (M1/M6)**: the dock Settings gear was icon-only (`font-size:0`, hidden label), so users didn't realize it opened bet amount + game options (chips/decks/rules). `BetPanel` now labels it **"Bet & options"** (or "Bet settings" when a game has no extra controls), shows a one-time `.bp-mobile-setup-hint` "Set bet & options ↑" nudge + pulse when setup controls exist and the sheet hasn't been opened, and exposes `data-mobile-settings-toggle` / `data-mobile-setup-hint`. Opening the sheet reveals the deck/chip/rule selectors the report mistook for "missing".
- M4/M5/M7 (Sic Bo / Video Poker padding, paytable scroll, dead space) were already addressed in prior waves (`padding-bottom: calc(var(--mobile-action-height,74px)+18px)`, `vp-paytable-shell` `max-height + overflow-y:auto`); M3 is further improved by the roulette breakpoint change.

### Files modified
- `src/components/games/primitives/BetPanel.jsx` — labeled "Bet & options" mobile settings button, first-time setup nudge, `openMobileControls` helper, new data hooks.
- `src/components/games/primitives/primitives.css` — settings button shows its label (column layout), `.bp-mobile-settings.nudge` pulse, `.bp-mobile-setup-hint` pill, reduced-motion fallbacks, 390px dock retune.
- `src/components/games/roulette/RouletteGame.jsx` — `.rou-bet-jump` affordance + `#roulette-bet-board` anchor id.
- `src/components/games/roulette/roulette.css` — compaction breakpoint 480→760px, jump affordance styles, board `scroll-margin-top`.
- `src/components/games/slots/slots.css` — hide in-flow `slot-panel-spin` at ≤760px.
- `src/components/games/slots/slotFactory.test.js` — updated the mobile-spin contract to assert the single fixed-dock CTA.

### Verification
- `npm test -- --run` green at 257 tests across 59 files (updated 1 slot contract test to the corrected single-CTA behavior).
- `npm run build` clean (37.7s) with only the pre-existing empty `phaser`/`matter` chunk + large `rows-*` warnings.
- Browser smoke against the production preview at **492x820** and **375x667** across `/`, `/roulette`, `/slots`, `/blackjack`, `/baccarat`, `/videopoker`, `/sicbo`: all 14 route×viewport combos `overflow=0px action=yes interaction=passed errors=0`. The `interaction=passed` mobile hit-test (CTA fires at its visual center) is direct automated evidence against the report's B1 hit-box theory.
- Manual playwright confirmations on the fresh build: roulette board lifted 1301→551px + bet-on-17 + portal Spin; slots single visible Spin with passing hit-test; blackjack "Bet & options" sheet opens to reveal deck/S17-H17 selectors.

## Multi-Track Gameplay + Progression Overhaul (2026-06-05)

User feedback after the v4 deploy raised seven items. Tackled across five tracks (A scroll → B poker → E sportsbook env → D progression → C slots).

### Track A — Universal mobile scroll fix (fixes "UX stuck", "can't scroll", "slots play button mid-screen")
- Root cause: `.gs-layout { overflow: hidden }` (`primitives.css`) was never reset on mobile, so any game whose content exceeded the flex height was clipped instead of scrolling. Slots was worst because it passes a real in-flow `.slot-panel-v2` (not a portaled BetPanel) that has no mobile bottom-sheet treatment, so it spilled out of the `height:0` `.gs-panel`.
- Fix: `@media (max-width:720px)` now sets `.gs-layout { overflow: visible !important }` so overflowing content extends the scrollable `.game-shell`. Added `.gs-panel:has(.slot-panel-v2) { height:auto }` and a slots `@media(max-width:760px)` block that reflows `.slot-panel-v2` as a normal scrollable card below the reels (template/bet/buy), leaving the fixed `slot-mobile-dock` as the single Spin CTA.
- Verified: `.game-shell` becomes the scroller (`scrollH 1412 > clientH 615`), single visible Spin, no horizontal overflow at 447/492/375.

### Track B — Poker card overhaul (fixes "no live poker cards")
- Cards always rendered from engine state but mobile CSS shrank hero hole cards to 17×25px and board to 28×40px — illegible, read as "missing".
- Rebuilt `PokerCard` with a corner (rank+suit) + center pip layout (real-card fidelity). Marked the human seat `is-human`; enlarged hero hole cards to 46×66px and board to 38×54px on mobile, kept the existing deal animation.
- Verified live: hero `46×66`, board `38×54`, corner+pip present.

### Track E — Sportsbook real feed (fixes "fake team names")
- Diagnosis: production Netlify only had `NODE_VERSION`; none of the four provider tokens were set, so the live feed never activated and only the synthetic `EVENT_BLUEPRINTS` showed.
- Set production env vars from `.env.local`: `SportsGameOdds_token`, `pandascore_token`, plus valid-named aliases `ODDS_API_IO_TOKEN` and `API_FOOTBALL_TOKEN` (hyphenated key names are rejected by Netlify; the proxy already accepts these uppercase aliases). Live events prepend synthetic ones; `feedSource` flips to `live` when any provider returns events.

### Track D — XP / level system + expanded achievements & missions (fixes "improve single-player, add achievements/quests")
- New `src/data/xpLevels.js`: 100-level quadratic curve, 9 cosmetic rank tiers (Rookie → Mythic), and a pure `xpForRound` award model (base + wager/win/multiplier bonuses + one-time new-game / daily-first bonuses). Covered by `xpLevels.test.js` (8 tests).
- New `src/hooks/useXp.js`: singleton + listener hook mirroring `useProgress`, persisted to `gampo_xp_state`, fed from `useGameSession.record` alongside the existing PnL/progress/missions calls. Emits `recentLevelUp` (flags rank-ups).
- Achievements: +14 new (extended streaks, loss-streak resilience, net-profit milestones, single-hit highlights, 1000× multiplier, 40-game completionist, and a new `bonus` group for slot-feature engagement). Added stat counters to `useProgress` (`bestLossStreak`, `bestProfit`, `biggestSingleWin`, `bonusRoundsTriggered`, `freeSpinsAwarded`) plus a `recordFeatureEvent` hook wired into the slot free-spin trigger.
- Missions: +9 new across daily/weekly/lifetime (profit/volume/variety/big-win), with `netProfit`/`bestSingleWin` added to the period tracker and new route mappings.
- UI: XP bar (level, rank, progress, total) in `ProgressPanel`; level-up variant of `AchievementToast` using the rank accent; XP reset scope.

### Track C — Slot mechanics/animation + feature-contract fidelity (fixes "improve slot animations/bonus, reinforce gameplay")
- Reel-stop landing bounce: settled cells during spin phases play a `slotCellLand` overshoot keyframe (tactile per-column "thunk"), with reduced-motion fallback. Strengthened base reel motion.
- Feature contract panel now shows a stats grid (RTP / volatility / grid / indicative max win derived from top symbol pay × feature ceiling) and a derived 5-of-a-kind paytable (top 6 symbols with art + multipliers) pulled live from each template config — applies to all 20 templates.

### Verification
- `npm test -- --run` green at 265 tests across 60 files (+8 xpLevels).
- `npm run build` clean (pre-existing empty-chunk/large-row warnings only).
- Browser smoke at 492×820 and 375×667 across `/`, `/poker`, `/slots`, `/blackjack`, `/roulette`, `/baccarat`, `/sportsbook`, `/missions`, `/vip`: 0 overflow, 0 console errors; `interaction=passed` on all gameplay routes. (`/vip` reports `action=no` — a dashboard with no play CTA the harness expects; benign.)

## Sportsbook Live-Feed Only (2026-06-05)

Follow-up to Track E: with the provider tokens set, the feed was connected but the curated home shelves still showed synthetic blueprint teams (Harbor United, "Practice XI" outrights) because only synthetic events carried the `top`/`popular` curation tags.

### Changes
- `sportsbookFeed.js`: when any real provider returns events, the feed now uses **only** live events (synthetic is a pure offline/no-token fallback). Added `curateLiveEvents()` which ranks real events by live-status + popularity and assigns `top` / `popular` / `starting-soon` tags so the home shelves render real teams. Bumped the feed cap 40→60 and switched sports/leagues bases to live when a feed exists.
- `SportsHome.jsx`: accepts `feedSource`; the hardcoded "World Cup Winner — Practice XI" outrights are replaced (when live) by a derived "Title Contenders — Live Favourites" board built from the shortest-priced real moneyline favourites, each clickable to open the event. Synthetic outrights only render in fallback.
- `sportsbookData.js`: promo-card copy de-"simulated"/"synthetic".
- `SportsbookShell.jsx`: passes `feedSource` into `SportsHome`.
- `sportsbookFeed.test.js`: new test mocks a live PandaScore payload and asserts no `synthetic` source and no `Practice`/blueprint team names survive, and that live events receive `top`/`popular` curation tags.

### Verification
- `npm test -- --run` green at 266 tests across 60 files (+1 live-feed test).
- `npm run build` clean.
- Deployed to production and confirmed live: Top Matches / Popular Events / Title Contenders all show real MLB + CS2 teams (Miami Marlins, Tampa Bay Rays, QUAZAR, ReThink, NY Yankees…); header reads "optional feed connected · API quota 2460". Zero "Harbor United" / "River City" / "Practice XI" anywhere. Synthetic fallback still intact when no tokens/network.

## Repo Audit + Hardening (2026-06-10)

Principal-level repo audit. High-confidence findings only, each verified against source; fixes shipped same-pass. Health: **B** — strong test discipline (453 tests / 88 files) and clean build, but had leaked API keys in source, known-vulnerable deps, no CI gate, and two dead heavyweight dependencies.

### Findings (verified)

| # | Sev | Finding | Evidence | Status |
|---|-----|---------|----------|--------|
| 1 | **Critical** | 3 hardcoded Odds API keys committed in `FALLBACK_KEYS` and shipped in the client bundle; anyone could extract and burn the quota | `src/services/sportsApi.js:6-10` (pre-fix) | **Fixed** |
| 2 | **High** | `npm audit`: react-router-dom open-redirect (GHSA-2j2x-hqr9-3h42, moderate ×2) + vitest≤3 chain incl. 1 critical (Vitest UI arbitrary file read/execute) + esbuild/vite dev-server advisories | `package.json:31,45,46` (pre-fix); `npm audit` output | **Fixed** |
| 3 | **High** | No CI: no `.github/`, no lint config, nothing enforces the README's "Required Verification" — regressions only caught manually | repo root (no `.github`, no eslint/prettier config) | **Fixed** (CI added; lint still open) |
| 4 | **Medium** | `phaser` (~1.4MB) and `matter-js` in `dependencies` but unused — only a comment mentions Phaser (`DinoEngine.js:1` says "no Phaser"); build emitted empty `phaser`/`matter` chunks every run (the long-standing warning noted since 2026-05-25) | `package.json:25-26`, `vite.config.js:32-33` (pre-fix) | **Fixed** |
| 5 | **Medium** | 112 `Math.random()` call sites in `src/` — audited top files: all are presentational (sim-crowd targets `CrashGame.jsx:77-86`, particles, fake feeds), not payout paths; payouts route through `nextRoll` (`CrashGame.jsx:15,202`). Risk is drift: nothing structurally prevents a future payout path using `Math.random()` | grep count; `CrashGame.jsx:77-86` | Open (M2) |
| 6 | **Medium** | 9 plinko outcome tables ~1.8MB each (~16MB total) as JS source in `src/components/games/plinko/engine/outcomes/rows-*.js`; slows transform/collect, inflates repo; already chunk-split at runtime so only a build/DX cost | `outcomes/rows-8..16.js` (1776-1805 KB each) | Open (M3) |
| 7 | **Low** | `vite.config.js:18` hardcodes a personal zrok tunnel host in `allowedHosts` | `vite.config.js:18` | Open (M3) |
| 8 | **Low** | `netlify/functions/sportsbook-free-feed.mjs:24` swallows the provider error (`catch {}` → generic 502), making prod feed failures hard to diagnose | `sportsbook-free-feed.mjs:24-30` | Open (M3) |

Healthy areas (verified, no findings): test suite green and meaningful (math/RTP/engine contracts, not just smoke); `netlify.toml` minimal and correct; `.gitignore` covers env/logs/artifacts and `.env.local` is untracked (`git ls-files` + `git log --all -- .env.local` both empty); server-side provider proxy keeps tokens off the client; README accurate.

### Shipped this pass

1. **Secret removal** — deleted `FALLBACK_KEYS` from `src/services/sportsApi.js`; `getKeys()` now returns env keys or `[]` (graceful no-feed fallback already existed downstream). `src/utils/sportsApi.test.js` stubs `VITE_ODDS_API_KEYS` via `vi.stubEnv`. ⚠️ The 3 keys remain in git history and were publicly served — **rotate/revoke them at the provider** (manual step, see Open Items).
2. **Dependency security** — `npm audit fix` cleared the react-router advisory; upgraded `vite` 5→7.3.5, `vitest` 1→4.1.8, `@vitejs/plugin-react` 4→5 to clear the esbuild/vite/vitest chain. `npm audit`: **0 vulnerabilities** (was 3 moderate + 1 critical). Added `testTimeout: 60000` to `vite.config.js` (vitest 4 default 5s broke the ~20s Monte Carlo `slotRtp.test.js`).
3. **Dead deps removed** — uninstalled `phaser` + `matter-js`, dropped their `manualChunks` entries. Empty-chunk build warnings gone.
4. **CI gate** — new `.github/workflows/ci.yml`: Node 20, `npm ci` → `npm test` → `npm run build` → `npm audit --omit=dev --audit-level=high` on push/PR to main/master.

### Verification

- `npm test` green: **453 tests / 88 files** on vitest 4 (pre-audit baseline 453/88 — no regressions).
- `npm run build` clean on vite 7 in 11.5s; only the pre-existing large `rows-*` chunk note remains; empty `phaser`/`matter` chunk warnings eliminated.
- `npm audit`: 0 vulnerabilities (was 2 moderate prod + 1 critical dev-chain).

### Files modified

- `src/services/sportsApi.js` — `FALLBACK_KEYS` removed; env-only keys.
- `src/utils/sportsApi.test.js` — `vi.stubEnv('VITE_ODDS_API_KEYS', …)` in setup.
- `vite.config.js` — phaser/matter chunks removed; `testTimeout: 60000`.
- `package.json` / `package-lock.json` — phaser + matter-js removed; vite 7 / vitest 4 / plugin-react 5; react-router-dom patched.
- `.github/workflows/ci.yml` — new CI gate.

### Remaining plan (by milestone)

**M1 — Critical follow-ups (manual / next session)**
- [ ] **Rotate the 3 exposed Odds API keys** at the-odds-api.com and update Netlify env + `.env.local`. The keys are in git history and previously shipped in public bundles; removal from HEAD is not revocation. (S, manual)
- [ ] Push a commit so the new CI workflow runs once; confirm green on GitHub. (S)

**M2 — High-leverage guardrails**
- [ ] Add ESLint (flat config) + a `no-restricted-properties` rule banning `Math.random` under `src/**/games/**` outside an allowlist (sim/visual modules), wired into CI. Locks in the payout-RNG boundary from finding #5. (M)
- [ ] Add a wording-scan CI step (the project's own real-money-language constraint) if `scripts/` already has one; otherwise a simple grep gate. (S)

**M3 — Quality & polish**
- [ ] Convert plinko `rows-*.js` tables to fetched static JSON (or precision-reduced binary) to cut ~16MB of JS source and speed transforms. (L)
- [ ] Parameterize `allowedHosts` zrok entry via env (`vite.config.js:18`). (S)
- [ ] Log the caught error in `netlify/functions/sportsbook-free-feed.mjs` before returning 502. (S)

### Open items needing a human decision

- Key rotation (M1) requires provider-dashboard access — cannot be done from the repo.
- `package.json:3` version is still `1.0.0` with no tagging/release convention; decide whether versioning matters for this project.
- Uncommitted `SlotsGame.jsx`/`slots.css` changes predate this audit (in-progress work, left untouched).

## UI/UX Wave (2026-06-10) — partial, handed off

Plan + live status board: `docs/uiux-wave-2026-06-10.md`. Shipped this session:

- **Phase 0** (73b5387f): landed in-flight slots UX — segmented SpinModeControl (panel/stage/mobile sheet), mobile paytable bottom-sheet with focus trap + Escape, shared FeatureContractBody. Repo-audit hardening committed separately (82a022a9).
- **Phase 1 arcade unification complete** (b6adb227 + 84e3baa3): war mobile CSS + BetPanel `dockExtras` (Surrender reachable on the mobile dock during ties); shared dock-clearance rule on CoreStageFrame replacing 17 hand-rolled paddings; `StageActionButton` primitive adopted across blackjack/chickencross/tower/pump/tomeoflife/drill; legacy-7 (coinflip/rps/color/guess/lottery/sicbo/roulette) brought to baseline with ResultToast + ActionLockOverlay + useSfx; coinflip BigWinOverlay finally rendered; useScrollActionIntoView wired into keno/mines/plinko/tower/chickencross/baccarat; central `bigWinThresholds.js` registry replacing 8 inline magic numbers across all 33 games + cases; `data-mobile-critical-surface` now on all 33 games; one-off breakpoints normalized (466/500 → 480).
- **Phase 2 slots, S1 engine half** (172d4fed): `cascadeTumble` now records per-step `cascadeFrames` ({cells, winCells, stepPayout, stepMultiplier}) on the spin result. UI tumble animation not yet consumed — see handoff notes in the wave doc.
- New `audit:scroll` gate (45a98433): `scripts/auditPlayfieldOverflow.mjs` flags CSS that clips inside the gs-playfield scroll contract; wired into `audit:all`.

Verification: 454 tests green on vitest 4; build clean; browser smoke 18 arcade routes x 2 viewports = 36 combos, 0 overflow / 0 console errors (`output/browser-smoke/arcade-wave`).

Open: S1 UI half, S2-S4 mechanics (+calibration), S-anim pack, C1-C7 cases unbox, final deploy. All scoped with implementation notes in `docs/uiux-wave-2026-06-10.md`.
