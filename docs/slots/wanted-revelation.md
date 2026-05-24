# Wanted Revelation — benchmark notes

- Template id: `wanted-revelation`
- Skin: `wanted`
- Benchmark: Wanted Salvation / Sand and Ashes (Hacksaw)
- Reference root: `rainbetclone/stake-expanded-games-audit-2026-05-24/screenshots/10-wanted-salvation/` and `25-sand-and-ashes/`
- Reference policy: only `screenshot-quality-manifest.json` `status: "primary"` files, prefer `50/51/52/53-demo-session-*.png` and `71/72-stage-focus-*.png`.

## Layout

- 5 reels x 4 rows.
- Evaluation: line pays.
- Cell count: 20.

## Controls

- Bet input with 1/2 and 2x quick steppers.
- Turbo toggle.
- Autoplay drawer (10/25/50/100/∞) with optional advanced stops.
- Buy Bonus modal with three tiers: `Wanted Lite (40x)`, `Wanted Standard (60x)`, `Wanted Super (120x)`.
- Spin button on right side panel and on the stage frame.

## Spin timing

- Per-column reel-stop ramp via `cubicOut(col / cols)` with `baseStop = 200ms` (turbo `80ms`).
- Anticipation triggered when 2 scatters land in the first 3 columns; the last 2 columns slow by 1.65x and the stage shows the anticipation ring.
- Settle delay: 360ms (turbo 180ms).

## Win / result presentation

- Total-win banner with `darkWinOverlay: true`, dimming the reel area while the headline pays.
- Mystery reveal overlay played briefly post-stop showing which paying symbol the wanted cells morphed to.
- Recent results strip across the bottom; big-win threshold 8x triggers `BigWinOverlay`.

## Feature affordances

- Mystery primitive: `mysterySymbol = { id: 'wanted', candidates: ['badge', 'watch', 'rope'], chance: 1 }`. Every cell with `type: 'mystery'` morphs to the same paying symbol pre-evaluation.
- Scatter contract: 3+ STAR triggers 6 free spins, scatter pay 1.2.
- Buy tiers `lite/std/super`, with `guaranteedScatters` 2/3/4.
- Autoplay safety banner pinned: practice credits only, no real money.

## Missing deltas vs benchmark

- We do not implement Hacksaw's sticky-symbol upgrade chain or the wanted poster minigame; mystery here is a single morph per spin.
- No bespoke side-character animation; the character panel is a generic stylized mascot.
- Reel-stop sound is reused from the global tick/flip channel; no provider-specific sting.

## Reference screenshots

- `screenshots/10-wanted-salvation/71-stage-focus-loaded.png`
- `screenshots/10-wanted-salvation/72-stage-focus-intro-dismissed.png`
- `screenshots/10-wanted-salvation/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`
- `screenshots/25-sand-and-ashes/71-stage-focus-loaded.png`
- `screenshots/25-sand-and-ashes/72-stage-focus-intro-dismissed.png`
- `screenshots/25-sand-and-ashes/50-demo-session-01-ready.png` through `53-demo-session-08-settled.png`

## Resources

- Cover: `public/images/covers/generated/wanted-revelation.png` (1024x1024, AI-generated via 9Router cx/gpt-5.5-image).
- Symbols: `public/assets/games/slots/wanted/wanted-revelation-{hero,mid1,mid2,bonus}.png`.
- Provenance: `public/assets/games/slots/wanted/README.md`.
