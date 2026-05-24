# Wave 1 — Foundation + Dice pilot

Date: 2026-05-23
Plan parent: `docs/stake-rainbet-waves-plan-2026-05-23.md`

## Goal

Build the engine the rest of the waves stand on. Prove it on Dice. Don't touch any other game.

## What ships in Wave 1

- New shared primitives:
  - `SegmentedModeTabs`, `MultiplierBadge`, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`, `AudioToggle`.
- Round event helper:
  - `roundEvents.js` with `makeRoundEvent`, machine constants, `useRoundMachine`.
- RNG wrapper:
  - `roundRng.js` (deterministic LCG seeded from a string or `crypto.randomUUID()`).
- Resource manifest + preloader:
  - `originalsManifest.js`, `resourceRoles.js`, `useOriginalsPreloader.js`.
- Audio system (16-bit PCM mono wav, ships silent until audio-batch waves):
  - `audioContext.js`, `sfxManifest.js`, `useSfx.js`.
- `GameShell` accepts a `variant` prop (default `stake`).
- Dice retrofit using all of the above.
- Provenance README files for `public/audio/common/`, `public/audio/originals/dice/`, `public/images/originals/dice/`.

## Acceptance criteria

- `npm run build` passes.
- Dice route renders, plays a manual round, locks input, plays animation, shows result toast, unlocks.
- Recent results strip still populates.
- No console errors at 1440x900.
- Other 22 routes unaffected (foundation imports are unused there).

## Status

### Completed

- Plan and progress docs created.
- `src/utils/roundRng.js` deterministic LCG seeded via FNV-1a hash.
- `src/components/games/primitives/roundEvents.js` event helpers, machine constants, `useRoundMachine`.
- `src/components/games/primitives/SegmentedModeTabs.jsx` Manual/Auto/Strategy tab strip.
- `src/components/games/primitives/MultiplierBadge.jsx` shared multiplier display.
- `src/components/games/primitives/ResultToast.jsx` round outcome toast.
- `src/components/games/primitives/ActionLockOverlay.jsx` running-state lock overlay.
- `src/components/games/primitives/CoreStageFrame.jsx` fixed-aspect stage frame with loading skeleton.
- `src/components/games/primitives/AudioToggle.jsx` master mute toggle.
- `src/components/games/resources/resourceRoles.js` resource role taxonomy.
- `src/components/games/resources/originalsManifest.js` per-slug visual asset paths.
- `src/components/games/resources/useOriginalsPreloader.js` critical/optional asset preloader.
- `src/audio/audioContext.js` lazy WebAudio context, master gain, mute persistence.
- `src/audio/sfxManifest.js` per-game SFX role manifest, ships silent.
- `src/audio/useSfx.js` `play`/`preload` hooks; cached buffers; no-op when manifest path is null.
- `public/audio/common/README.md`, `public/audio/originals/dice/README.md`, `public/images/originals/dice/README.md` provenance notes.
- `GameShell.jsx` extended with `variant` prop (default `stake`) and AudioToggle in default extras.
- `src/components/games/primitives/index.js` re-exports new primitives + machine helpers.
- `src/components/games/primitives/primitives.css` Wave 1 primitive styling.
- `DiceGame.jsx` retrofitted to use `useRoundMachine`, `useOriginalsPreloader`, `useSfx('dice')`, `SegmentedModeTabs`, `MultiplierBadge`, `ResultToast`, `ActionLockOverlay`, `CoreStageFrame`.
- `npm run build` passes.
- Smoke test at 1440x900: Dice round (win @ 1.98x, +GC 4.90), Limbo, Crash, Mines all load without console errors.

### In progress

- None for Wave 1. Awaiting Wave 2 plan approval.

### Blocked

- None.

## Decision notes

- Wave 1 audio system is wired but ships silent. No `.wav` binaries are committed.
- `GameShell` default variant is `stake`. No `rainbet` switch is implemented.
- Round machine states: `idle -> configuring -> running -> resolving -> result -> idle`.
- RNG is a deterministic LCG; sufficient for replay parity in the simulator. Production-fairness work stays in `provably-fair.md`.
- `useOriginalsPreloader` returns `{ ready, missing, errors }`; controls render before stage finishes loading; primary action stays disabled until critical resources resolve.
- `useSfx` is a no-op when the manifest has no audio file for the requested role; this lets games declare event hooks now and add sounds later without code changes.
