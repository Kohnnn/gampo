# Rainbet 1:1 Parity Progress — 2026-05-22

## Goal
Make Crash, Roulette, and the broader game UI feel 1:1 vs Rainbet's web casino:
- Crash: rocket keeps flying after cashout, betting-open countdown synced to simulated players, Rainbet-style sim feed, accelerated multiplier curve.
- Roulette: replace conic wheel with 9Router-generated wheel asset, add real ball-radius physics, sim chip rail, Rainbet 3-column layout.
- Yellow cleanup: define a color-role system so blue is "your active bet", gold is feature/win only.

## Decisions (locked)
- Roulette wheel: replace CSS conic with the generated `roulette-wheel-premium.png`. Keep DOM pocket numbers as a thin readable ring on top.
- Crash: gate every round behind a 3.5s betting-open countdown synced with sim player bets.
- Crash sim feed: full Rainbet-style side rail (pending bets list + over-rocket popups).
- Yellow audit: full sweep across all games.
- 9Router image generation: unlimited, generate as many supporting assets as needed.

## Plan

### A. Roulette
1. Generate via 9Router:
   - `public/images/generated/roulette-ball-ivory.png`
   - `public/images/generated/roulette-felt-rainbet.png`
2. Replace wheel face with `roulette-wheel-premium.png`. Drop conic gradient. Keep DOM pocket spans.
3. Ball physics:
   - Drive `--ball-radius` CSS variable so ball spirals inward.
   - 3-phase animation: outer track fast, decay to pocket ring, settle bounce.
4. Layout: 3-column header (wheel | recent rail | live player feed). Felt full width below. Advanced bets collapsed.
5. Sim chip drops on the felt for sim bets and outcome reveal.

### B. Crash
1. Add `betting` phase with 3.5s countdown.
2. Sim players queue visible bets during `betting`, lock at countdown end.
3. Multiplier curve piecewise: `1.07^t` early, `1.10^t` after 5s.
4. Anchor sim cashout popups to live rocket endpoint via per-frame ref.
5. Add Rainbet-style side rail showing pending / cashed / busted simulated bettors.
6. Cashout polish: locked-multiplier chip beside live multiplier; live "still flying" delta until bust.

### C. Yellow-box system cleanup
1. Define new tokens in `src/styles/index.css`:
   - `--bet-marker` (blue): chip / your active bet across games.
   - `--feature-gold` (gold): big-win, jackpot, premium.
   - `--warn` (amber): true warnings only.
2. Map per game: Coinflip, Lottery, Sicbo, Baccarat bet markers, Blackjack insurance/total, Hilo cashout text, Limbo/Wheel/Color spinner accents, Slots paytable, Slots big-win callout, Chickencross current lane, Dice payout meta.
3. Keep gold only on win/feature signals.

## Progress

### Done
- Inspected current Crash, Roulette, and shared yellow styling.
- First polish pass already shipped:
  - Roulette wheel rebuild with conic + texture, sim feed, recent rail.
  - Plinko, Mines, Slots simulated live rails.
  - Soft cleanup of overused yellow on push pills, history rows, chip stack overlay, BetMetaList warn, Plinko active ball.
  - Crash continuation after cashout with missed-out delta.
- Loaded `.env.local` and confirmed 9Router is reachable; `cx/gpt-5.5-image` model available.
- Generated assets via 9Router:
  - `public/images/generated/roulette-wheel-premium.png`
  - `public/images/generated/roulette-ball-ivory.png`
  - `public/images/generated/roulette-felt-rainbet.png`
- Replaced roulette wheel material with image-first rendering. Conic gradient removed; DOM pocket numbers stay readable.
- Implemented `--ball-radius` driven physics. Ball spirals from outer track 46% → pocket ring 28% during the spin, with separate JS-driven CSS variable transition.
- Restructured roulette into Rainbet 3-column header: wheel | recent rail | live player feed. Felt full width below.
- Added felt asset as roulette table background.
- Crash now has betting-open phase:
  - 3.5s `betting` countdown synced with simulated player queue.
  - Round only starts after countdown completes.
  - Phase-aware bet panel (`betting` is treated as in-round to lock controls).
- Crash multiplier curve tuned: `1.07^t` early, `1.10^t` after 5s for Rainbet feel.
- Replaced Crash bottom strip with proper Rainbet-style side rail (live bets, target, profit/state per row).
- Sim-cashout popups remain anchored to live rocket endpoint (already in `CrashChart.jsx`).
- Added color-role tokens in `src/styles/index.css`:
  - `--bet-marker`, `--bet-marker-soft`, `--bet-marker-strong`
  - `--feature-gold`, `--feature-gold-soft`
  - `--warn`, `--warn-soft`
- Yellow sweep across games (kept gold only for true win/feature signals):
  - SicBo bet markers → blue
  - ChickenCross current lane (color + glow) → blue
  - Dice payout meta → blue
  - Coinflip choice highlight + hover → blue
  - Blackjack insurance/total card + label → blue
  - Baccarat selected bet → blue
  - Plinko active ball chip → blue role tokens
  - Hilo cashout text → blue
  - Slots paytable accent → blue
  - Keno picked numbers → blue

### In Progress
- (none — all checklist items completed)

### Verification
- `npm run build` passes.
- Existing `PlinkoEngine` chunk warning is unrelated.
- Manual sweep recommended at 1280, 1440, 1920 widths.

## Risks
- Large `PlinkoEngine` chunk warning is pre-existing and unrelated.
- Image-first wheel slightly increases roulette page weight; mitigate with object-fit + CSS sizing.
- Multiplier curve change must not affect RNG fairness contract; only frame interpolation changes.
