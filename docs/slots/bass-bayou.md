# Bass Bayou Collect — benchmark notes

- Template id: `bass-bayou`
- Skin: `bayou`
- Benchmark: Big Bass Rock and Roll Enhanced RTP (Pragmatic Play, Big Bass collect variant)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/04-big-bass-rock-and-roll-enhanced-rtp/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 5 reels x 3 rows.
- Evaluation: line pays.
- Cell count: 15.

## Controls

- Bet, turbo, autoplay, buy.
- Buy Bonus modal: `Bayou Buy (80x, 3 scatters)` and `Trophy Buy (160x, 4 scatters)`.

## Spin timing

- Per-column cubic-out reel stop, base 200ms (turbo 80ms).
- Anticipation `scatterMin: 2`.
- Settle delay 360ms.

## Win / result presentation

- Money symbols render with a gold value chip (`<i class="money-chip">`). Values resolve at spin time via `nextRoll('slots:bass-bayou:money:<index>')` and span `[1, 8]` at the bet baseline.
- Total-win banner; light overlay default.
- Big-win threshold 8x.

## Feature affordances

- Money symbol primitive: `type: 'money'` cells carry an attached value; spin total adds `moneyTotal` to the payout multiplier and emits a `money-collect` feature event.
- Free spins triggered by 3+ TAG scatters award 8 spins; the angler character (panel) is the visual anchor.
- Buy tiers force guaranteed scatters as in benchmark.

## Missing deltas vs benchmark

- No fisherman side-character animation that visibly walks across the screen during free-spin collect; we surface a panel mascot only.
- No re-trigger persistent multiplier (Big Bass variants ladder this); we keep money values self-contained per spin.
- Reel-stop sound is shared global tick/flip; no rock-and-roll guitar layer.

## Reference screenshots

- `screenshots/04-big-bass-rock-and-roll-enhanced-rtp/71-stage-focus-loaded.png`
- `screenshots/04-big-bass-rock-and-roll-enhanced-rtp/72-stage-focus-intro-dismissed.png`
- `screenshots/04-big-bass-rock-and-roll-enhanced-rtp/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/bass-bayou.png`.
- Symbols: `public/assets/games/slots/bayou/bass-bayou-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/bayou/README.md`.
