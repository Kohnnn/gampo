# Gummy Drops — benchmark notes

- Template id: `gummy-drops`
- Skin: `gummy`
- Benchmark: Gummy Drop 1000 / Sweet Fiesta (CreativeCity / Pragmatic)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/18-gummy-drop-1000/` and `19-sweet-fiesta-enhanced-rtp/`

## Layout

- 8 reels x 8 rows (64 cells), cluster pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Sweet Buy 100x` and `Sugar Rush 250x` (+2x persistent multiplier).

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 4`.

## Win / result presentation

- Total-win banner; cascade pill in the header tracks tumble step.
- Big-win threshold 8x.

## Feature affordances

- Cluster pays with `clusterMin: 6`.
- Cascade tumble ladder `[1, 2, 4, 8, 16, 32]`.
- Persistent multiplier baseline 1x, boosted by Sugar Rush tier or scatter retrigger.
- Scatter contract: 5+ LOLLIPOP triggers 12 free spins.

## Missing deltas vs benchmark

- No multiplier-orb cinematic; the cascade ladder is the only visible escalation.
- No bespoke "Sugar Rush" transition between base and free spins.

## Resources

- Cover: `public/images/covers/generated/gummy-drops.png`.
- Symbols: `public/assets/games/slots/gummy/gummy-drops-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/gummy/README.md`.
