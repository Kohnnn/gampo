# Mansion Megaways — benchmark notes

- Template id: `mansion-megaways`
- Skin: `mansion`
- Benchmark: The Dog Mansion Megaways Enhanced RTP (Pragmatic Play)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/26-the-dog-mansion-megaways-enhanced-rtp/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 6 reels with per-column rows `[3, 5, 7, 7, 5, 3]` (mid-heavy bulge). Different shape from `phoenix-megaways` to give visual variety.
- Evaluation: megaways.
- Cell count: 30.

## Controls

- Bet, turbo, autoplay, buy.
- Buy Bonus modal: `Mansion Buy (110x, 4 scatters)` and `Crypt Buy (250x, 5 scatters, persistent +2x)`.

## Spin timing

- Per-column cubic-out reel stop with megaways grid layout.
- Anticipation `scatterMin: 3`.
- Cascade tumble enabled with ladder `[1, 2, 3, 4, 6]` (gentler than phoenix).

## Win / result presentation

- Total-win banner; big-win threshold 8x.
- Persistent multiplier surfaced through scatter-trigger feature events; Crypt Buy starts the persistent at 2x.

## Feature affordances

- Megaways with bulge shape `[3, 5, 7, 7, 5, 3]`.
- Persistent multiplier: 1x baseline, +2x boost via Crypt Buy tier.
- Scatter contract: 4+ CANDLE scatters trigger 12 free spins.

## Missing deltas vs benchmark

- No per-spin row randomization; rows are hardcoded for v1.
- No dog mascot persistent collect (Pragmatic variant uses a barking sequence). We surface only the panel mascot.
- Persistent multiplier display widget is implicit via feature events; no dedicated meter is rendered yet.

## Reference screenshots

- `screenshots/26-the-dog-mansion-megaways-enhanced-rtp/71-stage-focus-loaded.png`
- `screenshots/26-the-dog-mansion-megaways-enhanced-rtp/72-stage-focus-intro-dismissed.png`
- `screenshots/26-the-dog-mansion-megaways-enhanced-rtp/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/mansion-megaways.png`.
- Symbols: `public/assets/games/slots/mansion/mansion-megaways-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/mansion/README.md`.
