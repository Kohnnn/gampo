# Iron Fist Demolition — benchmark notes

- Template id: `iron-fist`
- Skin: `iron`
- Benchmark: Fist of Demolition (Hacksaw)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/06-fist-of-demolition/`

## Layout

- 5 reels x 4 rows, ways pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Bell Buy 70x` and `Knockout Buy 180x` (+3x persistent multiplier).

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 2`.

## Win / result presentation

- Dark-win overlay turns the reel area dim while the headline pays.
- Big-win threshold 8x.

## Feature affordances

- Multiplier wheel: `features.multiplierWheel.values = [5, 10, 25, 50, 100]` with weights `[40, 30, 18, 9, 3]` declared on the config. Triggered when 3+ GONG scatters land. Wheel resolution is metadata for now; the scatter feature event surface carries the awarded value when wired in the next pass.
- Buy tiers force guaranteed scatters and the Knockout tier seeds a +3x persistent multiplier.

## Missing deltas vs benchmark

- Multiplier wheel mini-game UI is not yet rendered; the contract is captured in `multiplierWheel` for the next pass.
- No knockout-style flash transitions between base and feature states.

## Resources

- Cover: `public/images/covers/generated/iron-fist.png`.
- Symbols: `public/assets/games/slots/iron/iron-fist-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/iron/README.md`.
