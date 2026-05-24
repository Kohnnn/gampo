# Stake + Rainbet Waves Plan

Date: 2026-05-23
Source guide: `D:\gampo\rainbetclone\combined-stake-rainbet-implementation-guide-2026-05-24.md`
References:
- `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\`
- `D:\gampo\rainbetclone\rainbet-originals-audit-2026-05-23\`

## Approved scope and constraints

User answers (2026-05-23):
- Engagement: incremental wave-by-wave with review checkpoints, plan and progress documented.
- Net-new Stake-only games: first-pass playable.
- Asset generation: per-game via 9Router in batches.
- Audio: full per-game, 16-bit PCM .wav 44.1kHz mono, generated via 9Router in audio-batch waves.
- Rainbet: borrow polish into the default skin only, no `skin="rainbet"` switch.
- Retrofit existing games only when touched in current wave.
- Stake variant duplicates: build full new components (Stake Chicken, Stake Flip, Primedice are separate routes/components from existing close matches).
- QA: build + smoke test changed routes at 1440x900 each batch.
- Wave 1 pilot game: Dice.

Non-negotiable boundaries (from the guide, section 2):
- No copied Stake/Rainbet proprietary JS, shaders, WASM, or minified bundles.
- No copied proprietary images/audio/video into `public` or `src`.
- All assets clone-owned: generated, in-house SVG/CSS/canvas, or licensed.
- Simulator must remain fake-credit / demo-safe.
- No real-money deposit/withdraw/wager logic.

## Wave map

| Wave | Theme | Status |
|---|---|---|
| 1 | Foundation primitives + resource manifest + audio wiring + Dice pilot | shipped |
| 2 | Stake parity polish for existing games (Mines, Keno, Limbo, Plinko, Crash, Wheel, Blackjack, Hilo, Baccarat, Video Poker) | shipped |
| 3 | Net-new simple Stake Originals (Flip, Diamonds, Darts, Pump, Slide, Moles, Snakes, Cases) plus /collections CS-skin catalog | shipped |
| 4 | Heavy/themed Stake Originals (Drill, Packs, Tome of Life, Tarot) + slot themes Scarab Spin/Bars/Blue Samurai | shipped |
| 5 | Rainbet polish migration into default skin (War, Chicken Cross, Tower) | shipped |

Cross-wave guardrails:
- All new assets clone-owned.
- Per-game `public/images/originals/<slug>/README.md` with role and source notes.
- Each game ends each wave with: round-event flow, fake-credit loop, lock-on-running, recent-results strip, blocked/zero-balance state, no-blank-stage loading.
- Audio binaries arrive in dedicated audio-batch waves; pipeline is wired in Wave 1.

## Wave-by-wave checklist

### Wave 1 (foundation + Dice pilot)

Files to add:
- `src/components/games/primitives/SegmentedModeTabs.jsx`
- `src/components/games/primitives/MultiplierBadge.jsx`
- `src/components/games/primitives/ResultToast.jsx`
- `src/components/games/primitives/ActionLockOverlay.jsx`
- `src/components/games/primitives/CoreStageFrame.jsx`
- `src/components/games/primitives/roundEvents.js`
- `src/utils/roundRng.js`
- `src/components/games/resources/originalsManifest.js`
- `src/components/games/resources/resourceRoles.js`
- `src/components/games/resources/useOriginalsPreloader.js`
- `src/audio/audioContext.js`
- `src/audio/sfxManifest.js`
- `src/audio/useSfx.js`
- `src/components/games/primitives/AudioToggle.jsx`
- `public/audio/common/README.md`
- `public/audio/originals/dice/README.md`
- `public/images/originals/dice/README.md`

Files to update:
- `src/components/games/primitives/GameShell.jsx` (add `variant` prop, default `stake`)
- `src/components/games/primitives/index.js` (re-export new primitives)
- `src/components/games/primitives/primitives.css` (CSS for new primitives + variants)
- `src/components/games/dice/DiceGame.jsx` (pilot retrofit using new primitives + machine + preloader + sfx)

Acceptance:
- `npm run build` passes.
- Dice route renders, plays a manual round, locks input, plays animation, shows result toast, unlocks.
- Recent results strip still populates.
- No console errors at 1440x900.
- No regression on the other 22 routes.

### Waves 2 - 5

Detailed file lists will be defined at the start of each wave, after the previous wave's review.

## Plan/progress docs

- This file: `docs/stake-rainbet-waves-plan-2026-05-23.md` (cross-wave plan).
- `docs/stake-rainbet-wave1-2026-05-23.md` (Wave 1 progress).
- One progress doc per subsequent wave at start of that wave.

## Decision log

- 2026-05-23: Default GameShell variant is `stake`. Rainbet is borrowed polish only, never a separate skin switch.
- 2026-05-23: Audio binaries are deferred until per-game audio batches; system is wired silent in Wave 1.
- 2026-05-23: Pilot game is Dice. Limbo and Mines retrofits land in Wave 2.
- 2026-05-23: Stake Chicken, Stake Flip, Primedice are separate components/routes from existing ChickenCross, CoinFlip, Dice.
- 2026-05-23: Stake Originals slot themes (Scarab Spin, Bars, Blue Samurai) are themes inside `SlotsGame`, not new components.

## Open questions for next waves

- Wave 2 pilot order: Dice -> Limbo -> Mines -> Keno first, or Plinko/Crash first?
- Rainbet polish migration: target list per game (need user pass on which Rainbet differences are worth borrowing).
- Audio batch trigger: after Wave 4 finishes new game shells, or rolling per game starting Wave 2?
- Card asset generation: shared 52-card deck for all card games (Blackjack, Baccarat, Video Poker, Hilo, Casino War, Tarot) or per-game styled decks?
