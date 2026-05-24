# Gates of Ascent — benchmark notes

- Template id: `gates-ascent`
- Skin: `olympus`
- Benchmark: Gates of Heaven 1000 Enhanced RTP (Pragmatic Play)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/02-gates-of-heaven-1000-enhanced-rtp/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 6 reels x 6 rows (uniform).
- Evaluation: pay-anywhere with `payAnywhereMin: 8`.
- Cell count: 36.

## Controls

- Bet input with 1/2 and 2x quick steppers, turbo toggle.
- Autoplay drawer with stop-on-feature/big-win/loss/gain.
- Buy Bonus modal with two tiers: `Ascent Buy (100x, 4 scatters)`, `Olympus Buy (220x, 5 scatters, persistent +2x)`.
- Stage spin button + panel spin button.

## Spin timing

- Per-column cubic-out reel stop, base 200ms (turbo 80ms).
- Anticipation `scatterMin: 3`. Last two columns slow when 3 scatters land early.
- Settle delay 360ms.

## Win / result presentation

- Total-win banner with light overlay. Big-win threshold 8x.
- Pay-anywhere wins highlight every cell containing the matching symbol; high-density grids glow brightly under win pulse.
- Recent results strip persists between spins.

## Feature affordances

- Pay-anywhere: any 8+ matching symbols anywhere on the grid pay; multiplier scales with `count / 8`.
- Persistent multiplier: starts at 1x; grows by +1 on every retrigger (handled in feature event payload).
- Scatter contract: 4+ GATE scatters trigger 8 free spins.
- Buy tiers expose `persistentMultiplier: 2` on the Olympus tier.

## Missing deltas vs benchmark

- No tumbling tumble after pay-anywhere wins; the engine only applies cascade for cluster/pay-anywhere when `features.cascade` is set; we left cascade off here to keep the pay-anywhere flow distinct from `mummy-cascade`.
- Storm/lightning intro animation is omitted; we use the shared intro overlay only.
- Multiplier collect ladder during free spins is implied via persistent multiplier rather than a separate orb collect.

## Reference screenshots

- `screenshots/02-gates-of-heaven-1000-enhanced-rtp/71-stage-focus-loaded.png`
- `screenshots/02-gates-of-heaven-1000-enhanced-rtp/72-stage-focus-intro-dismissed.png`
- `screenshots/02-gates-of-heaven-1000-enhanced-rtp/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/gates-ascent.png`.
- Symbols: `public/assets/games/slots/olympus/gates-ascent-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/olympus/README.md`.
