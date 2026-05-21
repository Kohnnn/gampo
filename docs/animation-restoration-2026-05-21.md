# Animation Restoration Plan — 2026-05-21

## Goal
Restore 1:1 Stake-style animations and assets for Plinko, Crash, Mines, Dino,
plus address remaining items from `docs/evaluationreport.md`.

## Source of Truth
Reference reside at `example/stake-originals-clone/` (read-only). We port the
playable cores into the GamPo shell (`GameShell`, `BetPanel`, `useGameSession`,
`fairRng`, `CreditContext`).

## Phases

### Phase 1 — Plinko canvas physics
- Port `Ball.js`, `PlinkoEngine.js`, `constants.js`, `plinkoOutcomes.js` to
  `src/components/games/plinko/engine/`.
- `plinkoOutcomes.js` is bundled inline as a code-split JS module via dynamic
  `import('./engine/plinkoOutcomes.js')` so it only ships when Plinko is loaded.
- Rewrite `PlinkoGame.jsx` to mount a 760×570 canvas, drive engine with bet,
  rows, risk, ball-type. RNG bridges `fairRng.nextRoll('plinko')` to the
  engine's deterministic bin path.
- Ball selector (Basic, Bronze, Silver, Emerald, Ruby, Sapphire) using the
  existing SVGs at `public/images/coins/coin_*.svg`.

### Phase 2 — Crash canvas chart
- New `CrashChart.jsx` with DPI-aware canvas, gradient stroke curve, ResizeObserver.
- Overlay rocket sprite (`/images/spaceship.png`), exhaust GIF
  (`/images/exhaust/exhaust02_preview.gif`), explosion GIF
  (`/images/explosions/normal_explosion.gif`).
- Idle "ghost curve" loop before the first bet.
- Lightweight `PlayerStrip.jsx` showing simulated player cashouts per round.

### Phase 3 — Mines SVG flip reveal
- Replace emoji rendering with `/images/mines/diamond.svg` (safe),
  `/images/mines/bomb.svg` (revealed), and `/images/mines/bomb_effect.gif`
  overlay on the hit cell.
- Add CSS 3D flip-on-reveal (220ms `rotateY(180deg)` with `backface-visibility`).
- Brighter idle border + hover differentiation per evaluation P3 #12.

### Phase 4 — Dino lightweight canvas
- New `DinoEngine.js` running a `requestAnimationFrame` loop that draws the
  existing `public/dino-assets/sprites/dino-atlas.{png,json}` frames.
- Run/jump/duck cycles, parallax ground, cactus + pterodactyl obstacles.
- Difficulty controls speed/spawn rate. Survival roll via `fairRng.nextRoll('dino')`.
- Idle demo runs the dino across the screen when phase==='idle'.

### Phase 5 — Eval-report polish
- Cards: shared `<CardFace/>` and `<CardBack/>` SVG components used by
  Blackjack, Video Poker, Baccarat, War. Pre-deal slots show face-down backs.
- Slots: theme symbol set (classic / cyber / mythic) + reel-spin animation.
- Lottery: CSS drum + ball-pop animation above the number grid.
- Dice: 4 last-roll pips with win/loss color.
- Roulette, RPS: scope decorative gradient/grid backgrounds to `.game-canvas`.
- Chicken Cross: cap visible lanes (~10) with internal scroll arrows.
- Sidebar Row 3: Chat trigger opening overlay; ChatDock becomes minimized pill.
- Limbo: enlarge result meter.
- Wheel: idle slow rotation + last-result chip.
- Blackjack: "Deal a hand to start" hint when phase==='idle'.
- Tower: idle gradient + hover differentiation.
- Idle loops: Crash ghost, Plinko demo every 12s, Coin Flip idle spin, Slots reel shimmer.

### Phase 6 — Verification
- `npm run build` clean.
- `npm test` green (44 baseline + 4 new engine tests).
- `/test/games-anim` harness for visual smoke check.
- Playwright pass capturing screenshots under `docs/qa-screens/2026-05-21/`.
- Append "Animation Restoration" section to `progress.md`.

## Risk Notes
- `plinkoOutcomes.js` historical size ~18 MB. Code-split keeps the main entry
  fast; only `/plinko` pays the load cost.
- Provably-fair drift avoided by keeping `fairRng.nextRoll` as the only RNG.
  No `ProvablyFair` class re-import.
- antd-only chrome from the reference is dropped; `GameShell` provides the same
  bet panel, history, stats, fairness, toolbar.

## Out of Scope
- New back-end integrations.
- New monetization features.
- Sportsbook polish (already complete).
