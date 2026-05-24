# Ghostblade Strike — benchmark notes

- Template id: `ghostblade-strike`
- Skin: `ronin`
- Benchmark: Ghostblade (Pocket Games)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/05-ghostblade/`

## Layout

- 5 reels x 4 rows, line pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Spirit Buy 80x` and `Ronin Buy 180x` (Ronin Buy carries a +2x persistent multiplier).

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 2`.

## Win / result presentation

- Total-win banner; big-win threshold 8x.
- Full-reel ghost wilds spawn through the standard win-pulse animation.

## Feature affordances

- Stacked wild reel: `wildSymbolId: 'ghost'`, `minStack: 3`. When 3+ ghost cells fill a reel, line wins crossing that reel get a `lineBoost` of 1.6x.
- Multiplier zones: middle reels (cols 1-3) carry a 3x multiplier (declared in `features.multiplierZones`; engine surface is documented for future evaluator hook).

## Missing deltas vs benchmark

- Multiplier zones are declared on the config but not yet scaled into win math; the engine emits the metadata for a future evaluator pass.
- No spirit transition animation between base and free-spins beyond the global mystery / win-pulse system.

## Resources

- Cover: `public/images/covers/generated/ghostblade-strike.png`.
- Symbols: `public/assets/games/slots/ronin/ghostblade-strike-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/ronin/README.md`.
