# Phoenix Megaways — benchmark notes

- Template id: `phoenix-megaways`
- Skin: `phoenix`
- Benchmark: Lucky Phoenix Megaways Enhanced RTP (Pragmatic Play)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/15-lucky-phoenix-megaways-enhanced-rtp/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 6 reels with per-column rows `[4, 5, 6, 6, 5, 4]` (Pragmatic-style mid-bulge). Hardcoded for v1; per-spin row randomization is a future variant.
- Evaluation: megaways. `ways = product of matching column matches`.
- Cell count: 30.

## Controls

- Bet, turbo, autoplay.
- No buy bonus on this template (matches benchmark variant which does not always show feature buy).

## Spin timing

- Per-column cubic-out reel stop with megaways grid layout.
- Anticipation `scatterMin: 3`.
- Cascade tumble enabled with ladder `[1, 2, 3, 5, 10]`.

## Win / result presentation

- Total-win banner with megaways count badge inside the win label (e.g. `PHX 540 ways`).
- Cascade emits a `cascade` feature event with chain length.
- Big-win threshold 8x.

## Feature affordances

- Megaways evaluation: `evaluateMegaways()` walks each column and multiplies match counts to compute `waysProduct`.
- Persistent multiplier: 1x baseline; surfaced via feature event metadata, available for free-spin tracker.
- Scatter contract: 4+ EGG scatters trigger 10 free spins.

## Missing deltas vs benchmark

- Per-spin random row count is not yet implemented; current rows are fixed at `[4, 5, 6, 6, 5, 4]`. Future variant: roll per column 2-7 each spin via `nextRoll('slots:<id>:rows:<col>')`.
- No dedicated reel-row-change animation between spins.
- No phoenix wild that explicitly re-ignites cascades visually; cascade ladder is the only reignition mechanism.

## Reference screenshots

- `screenshots/15-lucky-phoenix-megaways-enhanced-rtp/71-stage-focus-loaded.png`
- `screenshots/15-lucky-phoenix-megaways-enhanced-rtp/72-stage-focus-intro-dismissed.png`
- `screenshots/15-lucky-phoenix-megaways-enhanced-rtp/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/phoenix-megaways.png`.
- Symbols: `public/assets/games/slots/phoenix/phoenix-megaways-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/phoenix/README.md`.
