# Changelog

## 2026-05 - Phase 7: assets generated, per-game refactor, live poker

Build mode: yes. Compliance: still fake-credit only. All bitmap art generated locally via 9Router `cx/gpt-5.5-image`; no third-party brand assets, no operator logos.

### Asset pipeline (Phase 1)

- `.env.local` extended with `NINEROUTER_URL` / `NINEROUTER_KEY` aliases (script previously couldn't read the lowercase keys).
- `scripts/genAssets.js` patched to:
  - Auto-load `.env.local` (Node doesn't natively).
  - Probe `cx/gpt-5.5-image`, `codex/gpt-5.5-image`, then earlier `cx/gpt-5.x-image` siblings, before falling back to OpenAI / Gemini / FLUX / MiniMax.
- `scripts/assetManifest.js` expanded from ~80 to ~94 prompts: card atlas (13×4), GamPo-branded card back, dice atlas, ambient backdrops (felt-green, felt-navy, neon-grid, stars, parchment), chip stack/tower, mines tile, roulette felt, sport crests including NFL/MLB, poker felt and avatars, hero-poker.
- `npm run gen:assets` ran end-to-end via `cx/gpt-5.5-image`. **94 PNGs** materialized into `public/assets/games/`. Documented in `docs/asset-pipeline.md`.

### Shared primitives (Phase 2)

New module `src/components/games/primitives/`:

- `<GameShell>` — 3-pane Stake-style layout (panel / playfield / aside) with title bar, balance pill, and themed backdrop (consumes the new generated assets).
- `<BetPanel>` — Manual / Auto / Strategy tabs. Auto includes count, ∞ mode, on-win and on-loss bet adjustments (Reset or Increase %), stop-on-profit, stop-on-loss, stop-on-single-win-≥. Drives an internal autoplay loop via `onPlay({ betAmount, mode })` returning `{ profit }`.
- `<HistoryDrawer>` — per-game history persisted to `localStorage` under `gampo_history_<gameId>` (last 200 entries). Win/loss/push styling on rows.
- `<StatsOverlay>` — total bets, win rate, profit, observed RTP, biggest win, win/loss streaks, last 24 results pill row.
- `<Asset>` — `<img>` primitive that gracefully falls back to a CSS/text node when the bitmap is missing.
- `useGameSession(gameId)` — exposes `history`, derived `stats`, `record(entry)`, `clear()` to every game.

### Refactor: 18 simulator games into per-game files (Phases 3-5)

`SimulatorGame.jsx` is now bypassed for all wired games. Each game has its own folder under `src/components/games/<id>/`, owning its state, JSX, and CSS:

- **Sub-batch A** (table feel): Dice, Limbo, Wheel, Roulette, Baccarat, Sic Bo.
- **Sub-batch B** (originals): Slots, Tower, Hi-Lo.
- **Sub-batch C** (arcade): Coin Flip, RPS, Guess, Color, Casino War, Video Poker, Lottery, Keno, Chicken Cross.

All games use the new `<GameShell>` + `<BetPanel>` + `<StatsOverlay>` + `<HistoryDrawer>`.

### Roulette racetrack

`src/components/games/roulette/RouletteGame.jsx` plus `layout.js`. Full European racetrack betting:

- Felt board (1-36 + 0 zero column, dozens, columns, even-money rows).
- Racetrack: Voisins du Zéro (17 numbers), Tier (12), Orphelins (8), Zero Neighbours (7).
- Chip selector (1, 5, 25, 100, 500), per-cell chip placement, undo/clear.
- Spinning wheel with counter-rotating ball, decelerating land at the chosen pocket.

### Baccarat roads

`buildBigRoad`, `buildBigEyeBoy`, `buildSmallRoad`, `buildCockroachPig` in `src/components/games/baccarat/roads.js`. Big Road draws columns of consecutive Banker/Player wins; derived roads compare positions N columns back to render red/blue dots. The full UI shows the bead row, bigger Big Road, plus Big Eye Boy / Small Road / Cockroach Pig.

Side bets added: Player Pair (12×), Banker Pair (12×), Big (1.54×), Small (2.5×).

### Sic Bo full betting layout

Even-money (Big/Small/Odd/Even), Three-Dice Total (4-17), Single Dice (2x/3x/4x), Specific Pair (11×), Any Triple (31×), Specific Triple (181×), and provision for Two-Dice Combo. Cup shake + dice tumble with reveal cascade.

### Live Poker (Phase 4)

New `/poker` route. Documented separately in `docs/games/poker.md`.

- 6-max NLH cash table with 5 bots and the user.
- Engine `src/poker/engine/Game.js` covers deck/shuffle (seeded via `fairRng`), blinds, action legality, side pots not yet implemented but central pot is, multi-street betting, showdown via `pokersolver`.
- `HeuristicBot` agent: pre-flop hand-strength heuristic plus 120-rollout Monte Carlo post-flop equity estimate; pot-odds-aware fold/call/raise.
- UI: oval felt with seat avatars, dealer button, action wheel with bet sizing presets, simulated chat sidebar.
- Buy-in 200 GC, cash-out returns remaining stack to the ledger.

### 16-bit synth SFX

`src/audio/AudioProvider.jsx` upgraded from a single-tone bank to small multi-osc compositions per cue. New cues: `cardSlap`, `chip`, `bigwin`. Existing cues (click, tick, deal, flip, win, loss, explode) feel chunkier and more arcade-era. Default still muted; header toggle unchanged.

### Tests

26/26 passing across 5 test files. No new tests added this pass; sub-batches were UI-heavy and rely on the existing math suites for outcome correctness.

### Bundle

| Chunk | Size | Gzip |
|-------|-----:|-----:|
| `index.js` (initial) | 75.87 KB | 23.70 KB |
| `react-vendor` | 163.90 KB | 53.50 KB |
| `chart` | 207.43 KB | 71.20 KB |
| `antd-vendor` (lazy) | 659.71 KB | 212.70 KB |
| `phaser` (lazy) | 1,478.41 KB | 339.65 KB |
| `PokerGame` (lazy) | 41.09 KB | 9.66 KB |
| `PlinkoPage` (lazy) | 34.38 KB | 11.05 KB |
| `SimulatorGame` (lazy) | 56.66 KB | 15.49 KB |

### Documentation

- `docs/asset-pipeline.md` — model priority list updated (`cx/gpt-5.5-image`).
- `docs/games/poker.md` — new.
- `docs/changelog.md` — this entry.
- `docs/roadmap.md` — Phase 7 marked done; remaining items rotated to "future".

### Known limitations / future

- Side pots not implemented (single-pot only); rolls into the next pass.
- Bot avatars are static — animated tells / mood frames defer to a later pass.
- Blackjack is still on `SimulatorGame`. Refactor planned for Phase 8.
- Sportsbook 1:1 brainstorm captured in `docs/roadmap.md` under "Sportsbook polish".
- Crash and Plinko keep their existing dedicated engines; their UI shells aren't yet integrated with the new shared `<GameShell>`.

## 2026-05 - Batch 5 + Batch 6: HMAC, code-split, Plinko outcomes JSON

(see prior entry below)

## 2026-05 - Batch 4: arcade chains (7 games)

## 2026-05 - Batch 3: card games (4 games)

## 2026-05 - Batch 2: visual quick wins (8 games)

## 2026-05 - Batch 0 + Batch 1: foundations + assets + sportsbook live

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus 14 simulators and a synthetic sportsbook.


## 2026-05 - Batch 4: arcade chains (7 games)

(see prior entry below)

- Tower, Chicken Cross, Lottery, Keno, Sic Bo, Slots, Roulette upgraded.
- Asset pipeline switched to `gpt-5.5-image` priority.

## 2026-05 - Batch 3: card games (4 games)

- Blackjack, Baccarat, Casino War, Video Poker upgraded.

## 2026-05 - Batch 2: visual quick wins (8 games)

- Dice, Limbo, Coin Flip, Wheel, Color Pick, Guess Number, RPS, Hi-Lo.

## 2026-05 - Batch 0 + Batch 1: foundations + assets + sportsbook live

- 9Router skill files installed.
- framer-motion (lazy-loaded), AudioProvider, fx primitives, header toggles.
- Asset pipeline (`scripts/genAssets.js` + manifest).
- Sportsbook with key rotation, cache, US/UK regions, drift, bet builder, TheSportsDB historical.

## 2026-05 (earlier) - Roadmap finish + visual polish

- `nextRoll` wired into Sic Bo, Tower, Chicken Cross.
- Blackjack Surrender + Insurance.
- Roulette history + hot/cold.
- Baccarat shoe history.
- Crash/Plinko/Mines CSS polish.

## 2026-05 (earlier) - Performance + provably fair + blackjack depth

- Code splitting + manual chunks.
- `fairRng.js` seed/nonce + Verify page.
- Blackjack deck count, S17/H17, basic-strategy hint, double-down.

## 2026-05 (earlier) - Rainbet-style polish, casino games, sportsbook polish

- Casino War, Chicken Cross.
- ChatDock + simulated race.
- Slot themes/variants.
- Sportsbook tabs/Singles/Parlay/System.
- Lobby horizontal-scroll category rows.

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus 14 simulators and a synthetic sportsbook.


## 2026-05 - Batch 3: card games (4 games)

(see prior entry below)

- Blackjack: real card render, hidden hole-card, chip-fly, 500-hand study runner.
- Baccarat: squeeze reveal + bead road.
- Casino War: card slam + Go-To-War tie option.
- Video Poker: paytable highlight + hold-pin animation.

## 2026-05 - Batch 2: visual quick wins (8 games)

- Dice, Limbo, Coin Flip, Wheel, Color Pick, Guess Number, RPS, Hi-Lo.

## 2026-05 - Batch 0 + Batch 1: foundations + assets + sportsbook live

- 9Router skill files installed.
- framer-motion (lazy-loaded), AudioProvider, fx primitives, header toggles.
- Asset pipeline (`scripts/genAssets.js` + manifest).
- Sportsbook with key rotation, cache, US/UK regions, drift, bet builder, TheSportsDB historical.

## 2026-05 (earlier) - Roadmap finish + visual polish

- `nextRoll` wired into Sic Bo, Tower, Chicken Cross.
- Blackjack Surrender + Insurance.
- Roulette history + hot/cold.
- Baccarat shoe history.
- Crash/Plinko/Mines CSS polish.

## 2026-05 (earlier) - Performance + provably fair + blackjack depth

- Code splitting + manual chunks.
- `fairRng.js` seed/nonce + Verify page.
- Blackjack deck count, S17/H17, basic-strategy hint, double-down.

## 2026-05 (earlier) - Rainbet-style polish, casino games, sportsbook polish

- Casino War, Chicken Cross.
- ChatDock + simulated race.
- Slot themes/variants.
- Sportsbook tabs/Singles/Parlay/System.
- Lobby horizontal-scroll category rows.

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus 14 simulators and a synthetic sportsbook.


## 2026-05 - Batch 2: visual quick wins (8 games)

(see prior entry below)

- Dice, Limbo, Coin Flip, Wheel, Color Pick, Guess Number, RPS, Hi-Lo all upgraded with audio cues, particles, win/loss state, NumberRoll, field flashes.
- New keyframes: fieldWinFlash, fieldLossFlash, coin3dFlip, rpsSlamLeft/rpsSlamRight, hiloFlip, numberSpin, limboDrift.

## 2026-05 - Batch 0 + Batch 1: foundations + assets + sportsbook live

- 9Router skill files installed at `.agents/skills/`.
- framer-motion (lazy-loaded), AudioProvider with Web Audio synth, fx primitives, header audio + reduced-motion toggles.
- `scripts/genAssets.js` + `scripts/assetManifest.js` for ~80 prompts. `npm run gen:assets` script.
- `src/services/sportsApi.js` with key rotation, cooldown, cache, quota.
- Sportsbook UI: live odds (US/UK), F1, drift indicators, bet builder, educational history via TheSportsDB.

## 2026-05 (earlier) - Roadmap finish + visual polish

- `nextRoll` wired into Sic Bo, Tower, Chicken Cross.
- Blackjack Surrender + Insurance.
- Roulette history + hot/cold.
- Baccarat shoe history.
- Crash/Plinko/Mines CSS polish.

## 2026-05 (earlier) - Performance + provably fair + blackjack depth

- Code splitting + manual chunks.
- `fairRng.js` seed/nonce + Verify page.
- Blackjack deck count, S17/H17, basic-strategy hint, double-down.

## 2026-05 (earlier) - Rainbet-style polish, casino games, sportsbook polish

- Casino War, Chicken Cross.
- ChatDock + simulated race.
- Slot themes/variants.
- Sportsbook tabs/Singles/Parlay/System.
- Lobby horizontal-scroll category rows.

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus 14 simulators and a synthetic sportsbook.


## 2026-05 - Batch 0 + Batch 1: foundations + assets + sportsbook live

(see prior entry below)

### Foundations (Batch 0)

- 9Router skill files installed.
- `framer-motion` added (lazy-loaded).
- AudioProvider with Web Audio synth tones.
- fx primitives module + `useReduceMotion`.
- Header audio + reduced-motion toggles.

### Asset pipeline (Batch 1)

- `scripts/genAssets.js` + `scripts/assetManifest.js` for ~80 prompts.
- `npm run gen:assets` script.

### Sportsbook (Batch 1)

- `src/services/sportsApi.js` with key rotation, cooldown, cache, quota.
- Live odds (US/UK), F1 inclusion, drift indicators, bet builder, educational history via TheSportsDB.

## 2026-05 (earlier) - Roadmap finish + visual polish (Batch 1.5)

- `nextRoll` wired into Sic Bo, Tower, Chicken Cross.
- Blackjack Surrender + Insurance.
- Roulette history + hot/cold.
- Baccarat shoe history.
- Crash/Plinko/Mines CSS polish.

## 2026-05 (earlier) - Performance + provably fair + blackjack depth

- Code splitting + manual chunks.
- `fairRng.js` seed/nonce + Verify page.
- Blackjack deck count, S17/H17, basic-strategy hint, double-down.

## 2026-05 (earlier) - Rainbet-style polish, casino games, sportsbook polish

- Casino War, Chicken Cross.
- ChatDock + simulated race.
- Slot themes/variants.
- Sportsbook tabs/Singles/Parlay/System.
- Lobby horizontal-scroll category rows.

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus 14 simulators and a synthetic sportsbook.


## 2026-05 (earlier same day) - Roadmap finish + visual polish

(see prior entries below)

### Originals & casino depth

- `nextRoll` wired into Sic Bo, Tower, and Chicken Cross.
- Blackjack: Surrender and Insurance.
- Roulette: history pills and Hot/Cold tracker.
- Baccarat: shoe history strip with running counts.

### Sportsbook (pre-Batch 1)

- TheSportsDB live feed cached per day.

### Lobby & navigation

- New `/promotions` page.

### Visual polish

- Crash: pulsing multiplier, history dot enter animation.
- Plinko: drop-shadow on canvas, hit-flash on payout bins.
- Mines: hover lift, flip on safe, bomb burst, multiplier bump.

## 2026-05 (earlier) - Performance, provably fair, blackjack depth

- Route-level code splitting (Crash, Plinko, Dino, Mines, Sportsbook, SimulatorGame).
- Manual chunks for `react-vendor`, `antd-vendor`, `phaser`, `matter`, `chart`.
- New `src/utils/fairRng.js` (server seed, client seed, nonce, recent-rolls log).
- Verify page wired to seed/nonce.
- Blackjack: deck count, S17/H17, basic-strategy hint engine, double-down.

## 2026-05 (earlier) - Rainbet-style polish, casino games, sportsbook polish

- Casino War (`/war`) and Chicken Cross (`/chickencross`).
- `SocialContext`, `ChatDock`, simulated chat + race tabs.
- Slot themes (Classic / Cyber / Mythic) and 5x3 / 6x4 variants.
- Sportsbook tabs, Singles / Parlay / System modes, optional TheSportsDB live fetch.
- Lobby horizontal-scroll category rows.

## Original

- Initial educational simulator with Crash, Plinko, Mines, Dino, plus Dice, Limbo, Keno, Wheel, Roulette, Blackjack, Slots, Coin Flip, RPS, Guess, Hi-Lo, and a synthetic sportsbook.
