# Miko Spirit Lanterns — benchmark notes

- Template id: `miko-spirit`
- Skin: `spirit`
- Benchmark: MIKO (Paperclip)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/09-miko/`

## Layout

- 5 reels x 5 rows, ways pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Lantern Buy 70x` and `Spirit Buy 160x` (+2x persistent multiplier).

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 2`.

## Win / result presentation

- Total-win banner; persistent-multiplier pill in the header on free-spin trigger.

## Feature affordances

- Stacked wild reel: `wildSymbolId: 'lantern'`, `minStack: 3`, `lineBoost: 1.4`.
- Persistent multiplier baseline 1x, boosted by tier or scatter retrigger.
- Scatter contract: 3+ TORII triggers 7 free spins.

## Missing deltas vs benchmark

- Sticky-wild lock between respins is not yet enforced across multiple spins; the visual treatment is single-spin only in v1.
- No bespoke lantern-light cinematic.

## Resources

- Cover: `public/images/covers/generated/miko-spirit.png`.
- Symbols: `public/assets/games/slots/spirit/miko-spirit-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/spirit/README.md`.
