# Roadmap

Tracking deferred work after Phase 7. Items marked **done** are addressed; the rest remain.

The strategy from Phase 7 forward is **batch shipping**: each batch ships independently with build + tests + docs.

---

## Phase 1 — Asset pipeline (done)

- 9Router env wired, manifest expanded, `cx/gpt-5.5-image` model.
- 94 PNGs generated under `public/assets/games/`.
- Documented in `docs/asset-pipeline.md`.

## Phase 2 — Shared primitives (done)

- `<GameShell>`, `<BetPanel>` (Manual / Auto / Strategy), `<HistoryDrawer>`, `<StatsOverlay>`, `<Asset>`, `useGameSession`.
- Auto-play loop with bet adjustments, stop conditions, ∞ mode, single-win-≥ stop.

## Phase 3-5 — Per-game refactor (done)

Sub-batch A: Dice, Limbo, Wheel, Roulette, Baccarat, Sic Bo.
Sub-batch B: Slots, Tower, Hi-Lo.
Sub-batch C: Coin Flip, RPS, Guess, Color, Casino War, Video Poker, Lottery, Keno, Chicken Cross.

All 18 simulator games now own their own folders with shell + autoplay + per-game history + live stats.

## Phase 4 — Live Poker (done)

- 6-max NLH cash table at `/poker`.
- JS engine in `src/poker/engine/Game.js`, hand evaluation via `pokersolver`.
- 5 simulated bots using a heuristic agent with Monte Carlo equity.
- Simulated chat sidebar.
- Audio cues from new 16-bit synth bank.

## Phase 5 — 16-bit synth SFX (done)

- `AudioProvider.jsx` upgraded to multi-osc compositions per cue.
- Default mute preserved; header toggle unchanged.

## Phase 6 — Specialty betting layouts (done)

- **Roulette racetrack** — Voisins du Zéro, Tier, Orphelins, Zero Neighbours.
- **Baccarat roads** — Big Road, Big Eye Boy, Small Road, Cockroach Pig.
- **Sic Bo full layout** — even-money, three-dice total, single dice, specific pair, any/specific triple.

---

## Phase 8 — Future / deferred

### Engine quality

- **Side pots in poker** — currently single-pot; needs proper allocation when stacks differ at all-in.
- **Pre-flop range tables / CFR-style** for poker bots — replace heuristic chart with a richer pre-flop range and a 1-ply look-ahead.
- **Bot personalities** — TightPassive, LooseAggressive, Maniac archetypes plus Monte Carlo aggression tuning per archetype.
- **9-max poker table** — alternate seat layout. Currently 6-max only.
- **Poker animations** — chip travel, card flip, dealer button rotation. Static today.
- **Multi-table tournament** — single-table tournament with blind levels, then SNGs.
- **Blackjack refactor** — currently still in `SimulatorGame.jsx`; move into per-game module with the new shell, plus split, study-mode UI charts.

### Sportsbook education

The dense sportsbook shell, provider fallback, mobile search, event detail, and betslip surfaces are in place. Next sportsbook work should deepen the learning layer without making the main interface feel like a lesson page.

- **Closing line value (CLV)** — compare accepted odds to later synthetic/provider odds movement and explain whether the user beat the close.
- **Consensus pricing** — when multiple providers/bookmakers are available, show no-vig consensus and highlight outlier prices for learning only.
- **Bankroll drills** — add practice stake sizing prompts, drawdown simulations, and risk-of-ruin examples inside the Odds Coach.
- **Provider source badges** — explain which rows are synthetic, SportsGameOdds, PandaScore, odds-api.io, API-Football, or The Odds API, with token/privacy caveats.
- **Market literacy packs** — compact coach lessons for props, totals, spreads, racing place markets, outrights, and same-game correlation.
- **Cashout lesson mode** — show a synthetic offer and the haircut math, but keep it practice-credit only.

### Other

- Full antd removal (replace with local `ui/` primitives).
- Crash/Plinko/Mines deeper engine overhauls (canvas curve smoothing, ball trails, gem icons, particle effects) integrated with the new shell.
- Playwright route smoke tests.
- Real-time chat backend (currently fake-only).
- More games: Slide / Goal, Dragon Tower, Cases, Pump.


- **Tower** — stacked tiles with parallax climb, fall shake on bust, cashout pulse.
- **Chicken Cross** — replace text "CHICK" with chicken SVG/PNG sprite (idle / hop / splat) from `gen:assets`, occasional cars, road tile parallax.
- **Lottery** — tumbler with bouncing balls, drop-by-drop reveal, sparkle particles on hits.
- **Keno** — tile pop on selection, drawn-ball drop animation onto grid, gold flash on hits.
- **Sic Bo** — cup shake, dice tumble out one by one, win-path chase lights.
- **Slots** — reel-by-reel stop (currently stagger-only), cluster connect-glow on cluster wins, theme-specific symbol assets from manifest.
- **Roulette** — actual rotating wheel SVG with ball traveling opposite direction, ball jitter on slowdown, felt board layout.

## Batch 5 — Performance + a11y

- Reduced-motion compliance audit across batches 2-4.
- Page-transition fades between routes.
- Replace `Math.random` shuffles with seeded variants when wired through `nextRoll`.
- Replace `hashTo32` with HMAC-SHA-256 via Web Crypto.
- Wire `nextRoll` into Crash, Plinko, Mines, Slots, Blackjack/Baccarat/War/Video Poker shuffles, Lottery.

## Batch 6 — Plinko + Ant Design slim

- Investigate `plinkoOutcomes.js` (precomputed table 18 MB) — runtime computation or per-bin JSON loaded on demand.
- Inventory remaining `antd` usages and replace with the local `ui/` primitives where possible.

## Tests

- **fairRng + blackjack strategy + originals math + sportsApi** — done.
- Add Vitest coverage for Baccarat draw rules and Casino War tie payoff.
- Add Playwright smoke for `/`, `/sports`, `/verify`, `/race`, `/promotions`.

## Open items / decisions

- HMAC-SHA-256 swap.
- Whether to commit generated PNGs (yes, post Batch 1 once user runs `npm run gen:assets`).
- Whether to add live odds drift in real-time (currently only on manual refresh).
