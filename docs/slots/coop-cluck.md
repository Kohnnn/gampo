# Coop Cluck Cluster — benchmark notes

- Template id: `coop-cluck`
- Skin: `coop`
- Benchmark: Motherclucker (Terminal)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/08-motherclucker/`

## Layout

- 6 reels x 6 rows, cluster pays.

## Controls

- Bet, turbo, autoplay, buy. Buy tiers: `Coop Buy 80x` and `Barn Buy 180x`.

## Spin timing

- Per-column cubic-out reel stop with anticipation `scatterMin: 3`.

## Win / result presentation

- Total-win banner; big-win threshold 8x.
- Coin meter pill in the header tracks chick collect progress (target 30).

## Feature affordances

- Cluster pays with `clusterMin: 5`.
- Coin collect: `coinMeter.target = 30`, paying `coinMeter.pay = 0.32` per chick. Meter visualization is in the stage header pill.
- Scatter contract: 4+ BASKET triggers 8 free spins.

## Missing deltas vs benchmark

- No "barn entry" transition cinematic; meter fill simply progresses across spins.
- No animated chick walk during free spins; collect contributes flat to spin total.

## Resources

- Cover: `public/images/covers/generated/coop-cluck.png`.
- Symbols: `public/assets/games/slots/coop/coop-cluck-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/coop/README.md`.
