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

