# Rainbet Parity v3 Plan & Progress — 2026-05-22

## Goals
1. Live poker: sit-and-go style fresh buy-ins at escalating stakes with blinds + antes + per-game timer.
2. Bots: random distribution favoring intermediate; less beginners; bots cannot read GTO.
3. GTO panel: deeper insight (mix bars, equity, EV deltas, hand-class breakdown, explanation).
4. Crash: fix bust animation freeze.
5. Roulette: keep tightening for Rainbet feel (betting countdown, chip flight, polish).
6. Page fit: every game must fit at 100% normal zoom, no scroll trap.
7. Game cards: Rainbet/Stake style — big number/type centered, optimized for visibility.
8. Cover art: regenerate all 23 game covers in consistent Rainbet/Stake style via 9Router, in batches.

## Decisions (locked)
- Buy-in ladder = ladder of fresh sits at higher required stakes (no progression gating).
- Apply sit-and-go rules: small blind + big blind + ante, end after X games (good default = 12 games per SnG).
- Bot difficulty distribution = randomized; weighted toward intermediate; advanced more frequent than beginner. Bots strictly isolated from GTO.
- Roulette betting countdown = 6s confirmed.
- Game card visual = Rainbet style, big subject + small bottom title.
- Generate covers in batches by category to keep style consistency.

## Plan (build order)

### A. Cover art batches
- Batch 1: Originals (Crash, Plinko, Mines, Dice, Limbo, Hilo).
- Batch 2: Tables (Roulette, Baccarat, Blackjack, Casino War, Sicbo).
- Batch 3: Cards/Slots (Slots, Video Poker, Keno, Lottery).
- Batch 4: Arcade/Other (Wheel, Color, Coinflip, Tower, ChickenCross, Dino, Guess, RPS).
- Saved to `public/images/covers/generated/<slug>.png` and wired in `src/data/gameDefinitions.js`.
- Style baseline: Rainbet/Stake-like dark navy gradient + subject hero center + soft accent glow + minimal copy.

### B. Crash bust freeze fix
- Add explosion-decay rAF loop for `~1.4s` after bust drawing animated explosion offset/decay.
- Capture endpoint at bust into a ref so explosion locks to the right pixel.
- Clear all crash refs on idle transition.

### C. Roulette polish
- Add 6s `betting` phase synced with sim chip flight.
- Improve ball physics: rotation phase 1.4s + radius decay 1.0s + 0.4s settle.
- Cap wheel size for normal zoom widths.
- Sim players animate chips onto felt cells.
- Winning cells animate up; losers fade.

### D. 100% zoom pass
- Add CSS token `--game-min-height: clamp(360px, 60vh, 600px)` and adopt across game stages.
- Replace fixed `min-height: 480/540/600px` with the token.
- Side rails use `min-height: 0` + scroll.
- Education panels move below fold.

### E. Game card redesign
- Rebuild `GameCard.jsx` + `casino.css`:
  - Cover image fills card.
  - Centered big subject in cover.
  - Title docked bottom-left over gradient.
  - Players-online pill top-left.
  - Bigger title type, larger number readouts (16px+).
  - Reduce metric clutter.

### F. Poker sit-and-go
- Replace static buy-ins with SnG ladder:
  - 1k, 5k, 25k, 100k, 500k.
- Each sit:
  - Blinds start at 10/20.
  - Ante added from level 4.
  - Blinds level up every `N` hands (default 4 hands).
  - SnG ends after 12 hands by default.
  - Auto/manual end-mode toggle.
- No chip-out: bust = SnG ends, you reset and pick a new tier.

### G. Bots harden + intermediate weighting
- Persona pool weights: 10% beginner / 60% intermediate / 30% advanced.
- Ensure `BotDecision.js` does not import any GTO advisor function.
- Add bluff frequency by stack depth + position.
- 3-bet ranges per position with persona variance.
- Texture-aware c-bet logic.

### H. GTO upgrades
- Add raise/call/fold mix bars.
- Add equity vs. range estimate.
- Add EV deltas vs. each alternative.
- Add hand-class breakdown.
- Add explanation chips (texture, position, persona).
- Cache per-street.

## Verification
- `npm run build` passes.
- Manual sweep at 1280x720, 1440x900, 1920x1080.
- Crash: no freeze on bust, explosion plays, returns to idle cleanly.
- Roulette: 6s betting → chip flight → wheel → ball physics → result reveal.
- Poker: bust ends SnG cleanly; new buy-in tier works.
- Game cards: numbers/titles readable from arm's length.
- Covers: visually consistent within each batch.

## Progress

### Done
- Added repeatable 9Router cover generator at `scripts/generateGameCovers.mjs`.
- Generated all 23 game covers to `public/images/covers/generated/*.png`.
- Wired all catalog game definitions to generated covers in `src/data/gameDefinitions.js`.
- Redesigned home grid cards to use large image-led covers with a centered titlemark and reduced metadata clutter.
- Fixed Crash post-bust freeze by locking the bust endpoint and animating explosion scale/drift/fade for `~1.4s`.
- Added Roulette `6s` betting countdown before manual spins and a visible betting-open banner.
- Extended poker engine with antes via `createInitialState({ ante })` and ante posting in `startHand`.
- Replaced poker buy-ins with fresh sit-and-go ladder: `1k`, `5k`, `25k`, `100k`, `500k`.
- Added poker sit-and-go state: hand `1/12`, blinds start `10/20`, levels every `4` hands, ante from level `4`, final cashout after hand `12`.
- Added poker table status chips for hand, level, blinds, and ante.
- Added bot difficulty distribution: `10% beginner / 60% intermediate / 30% advanced`.
- Passed bot difficulty into `HeuristicBot`; advanced gets a small decision-strength bump, beginner gets a small reduction.
- Added late/blind pressure aggression nudge based on current big blind versus bot stack.
- Verified with `npm run build` after Crash/Roulette/cards/covers before poker changes.
- Removed bot access to GTO chart JSON from `src/poker/bots/HeuristicBot.js`; bots now use local heuristic strength, position nudges, texture classification, and Monte Carlo equity only.
- Reduced bot aggression by lowering persona tuning, late-blind pressure, raise thresholds, and raise sizing.
- Added compact GTO decision-lab data: equity proxy, best EV, hand class, and raise/call/fold EV deltas.
- Tightened Roulette footprint for 100% zoom by reducing top deck, wheel, feed, and board dimensions.
- Increased category carousel card width/image height and title type for better arm's-length readability.
- Increased main game grid card size/titlemark type for clearer game identity.
- Verified again with `npm run build` after polish pass.

### In Progress
- Manual visual sweep remains.

### Deferred
- Full GTO panel upgrades: mix bars/equity/EV deltas/hand-class breakdown/per-street cache.
- Full 100% zoom manual sweep across every game viewport.
- Roulette chip-flight/winner-loser chip animation polish beyond the 6s betting phase.

### Risks
- Generating 23 covers may produce drift; mitigated by batched runs sharing a prompt template.
- Bot harden risks frustrating new players; mitigated by intermediate-heavy distribution + capped advanced.
- Crash explosion rAF could conflict with normal tick; mitigated by separate ref + cancel on phase change.
