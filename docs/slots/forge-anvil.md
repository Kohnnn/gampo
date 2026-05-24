# Forge of the Anvil — benchmark notes

- Template id: `forge-anvil`
- Skin: `forge`
- Benchmark: Waylanders Forge (Valkyrie)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/11-waylanders-forge/`

## Layout

- 5 reels x 3 rows, line pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Anvil Buy 90x` and `Grand Buy 220x` (+2x persistent multiplier).

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 2`.

## Win / result presentation

- Total-win banner; big-win threshold 8x.

## Feature affordances

- Hold-and-respin contract: `holdAndRespin = { triggerSymbolId: 'molten-coin', triggerCount: 6, respins: 3, jackpots: [Mini 8x, Minor 25x, Major 80x, Grand 200x] }`.
- The contract is declared on the config; the engine resolves the metadata in the spin payload for a future hold-and-respin board UI.
- Buy tiers force guaranteed scatters and Grand Buy seeds +2x persistent multiplier.

## Missing deltas vs benchmark

- The hold-and-respin board UI is metadata-only; the lock-and-respin loop is documented for the next UI pass.
- Jackpot tier reveal cinematic not yet rendered.

## Resources

- Cover: `public/images/covers/generated/forge-anvil.png`.
- Symbols: `public/assets/games/slots/forge/forge-anvil-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/forge/README.md`.
