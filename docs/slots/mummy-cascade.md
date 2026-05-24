# Mummy Cascade — benchmark notes

- Template id: `mummy-cascade`
- Skin: `mummy`
- Benchmark: Flaming Mummy (ColorfulPlay)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/22-flaming-mummy/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 6 reels x 6 rows (uniform).
- Evaluation: cluster pays with `clusterMin: 5`.
- Cell count: 36.

## Controls

- Bet, turbo, autoplay, buy.
- Buy Bonus modal: `Tomb Buy (90x, 4 scatters)` and `Pharaoh Buy (200x, 5 scatters)`.

## Spin timing

- Per-column cubic-out reel stop, base 200ms (turbo 80ms).
- Anticipation `scatterMin: 3`.
- Cascade tumble: each cascade step replaces winning cells with new picks via `nextRoll('slots:mummy-cascade:cell:<index + step*1009>')` and the new wins multiply by the next ladder step.

## Win / result presentation

- Total-win banner.
- Cluster wins highlight every connected cluster cell; cascades emit a `cascade` feature event with `steps` count.
- Big-win threshold 8x.

## Feature affordances

- Cascade ladder: `[1, 2, 3, 5, 10]`. Step 0 pays 1x, step 1 pays 2x, step 4 caps at 10x.
- Scatter contract: 4+ FLAME scatters trigger 10 free spins, scatter pay 1.4.
- Buy tiers force guaranteed scatters.

## Missing deltas vs benchmark

- No bespoke flame VFX between cascades; we rely on win pulse + the existing cell win animation.
- No specific reel-frame tomb door reveal during free spins.
- Cascade chain is capped at the ladder length (5 steps); does not run unbounded.

## Reference screenshots

- `screenshots/22-flaming-mummy/71-stage-focus-loaded.png`
- `screenshots/22-flaming-mummy/72-stage-focus-intro-dismissed.png`
- `screenshots/22-flaming-mummy/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/mummy-cascade.png`.
- Symbols: `public/assets/games/slots/mummy/mummy-cascade-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/mummy/README.md`.
