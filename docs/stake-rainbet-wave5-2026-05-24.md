# Wave 5 — Rainbet polish migration + War / Chicken Cross / Tower retrofit

Date: 2026-05-24
Plan parent: `docs/stake-rainbet-waves-plan-2026-05-23.md`
Wave 4 result: `docs/stake-rainbet-wave4-2026-05-24.md`

## Goal

Final wave. Two threads:
1. Retrofit War, Chicken Cross, Tower to the Wave 1/2 foundation
   (`useRoundMachine`, `MultiplierBadge`, `ResultToast`, `ActionLockOverlay`,
   `CoreStageFrame`, `useSfx`, `useOriginalsPreloader`).
2. Apply Rainbet visual polish globally via shared primitives CSS so every
   game route picks up the change without per-game edits.

## Approved scope (2026-05-24)

- Retrofit set: War, Chicken Cross, Tower only.
- Polish: global shared-primitives CSS pass. No per-game CSS edits in
  Wave 5.
- No new asset binaries committed. Existing manifest stubs already exist
  for these slugs from earlier wave work; only audio role declarations
  and provenance READMEs need filling out.

## Rainbet polish targets (from audit observations)

- Tighter game header / toolbar placement.
- Stronger game-specific stage framing (border + shadow accent on
  `core-stage`).
- Alternate control sizing on bet panels (slightly smaller padding,
  tighter section gaps).
- More visible recent-results rail between rounds (subtle glow / sticky).

## Status

### Completed
- Plan doc written.

### In progress
- Wave 5 complete. Engagement closed out.

### Blocked
- None.

## Wave 5 completion notes (2026-05-24)

- Appended Rainbet polish block to `src/components/games/primitives/primitives.css`:
  tightens `gs-titlebar` padding/font, strengthens `core-stage` border + shadow,
  shortens `bp-section` gaps and `bp-tabs` height, and gives `recent-results-strip`
  a subtle border + glow. Polish reaches every game route via shared primitives.
- `CasinoWarGame.jsx` retrofitted: `useRoundMachine` events on Draw, `MultiplierBadge`
  for Pay 2x, `ResultToast` (war win / tie / war loss), `ActionLockOverlay`
  (`Drawing...`), `CoreStageFrame`, `useSfx('war')`, `useOriginalsPreloader('war')`,
  `variant="stake"`.
- `ChickenCrossGame.jsx` retrofitted: round event machine on Start Crossing,
  `machine.finish(...)` on splat or cashout, `MultiplierBadge` for Current,
  `ResultToast` for splat / cashout, `ActionLockOverlay` (`Splat`),
  `CoreStageFrame`, `useSfx('chickencross')`, `variant="stake"`.
- `TowerGame.jsx` retrofitted: round event machine on Start Tower,
  `machine.finish(...)` on fall or cashout, `MultiplierBadge` for Climb,
  `ResultToast` (Fell at level / Tower cashed out), `ActionLockOverlay` (`Fell`),
  `CoreStageFrame`, `useSfx('tower')`, `variant="stake"`.
- Manifest stubs added in `originalsManifest.js` and `sfxManifest.js` for
  `war`, `chickencross`, `tower`.
- Provenance READMEs added under `public/images/originals/{war,chickencross,tower}/`
  and `public/audio/originals/{war,chickencross,tower}/`.
- `npm run build` passes after Wave 5.
- Smoke test at 1440×900: `/war` (`Pay 2.00x` badge, You/VS/Dealer card slots,
  win/tie-win panel chips), `/chickencross` (13 lane multipliers 1.00x → 27.98x,
  `Current 1.00x` badge, Easy/Medium/Hard difficulty), `/tower` (8-tile stack,
  `Climb 1.00x` badge, "Start Tower" CTA). No console errors.

## Wave 5 complete

- 3 Rainbet-distinct games (War, Chicken Cross, Tower) now route through the
  Wave 1/2 round event machine and shared primitives.
- Rainbet visual polish applied globally to all 38 game routes via shared
  primitives CSS.

## Engagement complete

All five waves shipped. The catalog now contains 38 game routes plus a
`/collections` browse view, all running on the unified Wave 1 foundation
with deterministic round events, MultiplierBadge / ResultToast /
ActionLockOverlay / CoreStageFrame primitives, silent-by-default audio
system, manifest stubs, and provenance READMEs.

## Decision log

- 2026-05-24: Rainbet polish ships as global shared-primitives CSS, not
  per-game CSS. Default skin absorbs the polish; no `skin="rainbet"`
  switch is added.
- 2026-05-24: War, Chicken Cross, Tower already use the GameShell shape
  from earlier work; Wave 5 wires them into the round event machine and
  surfaces shared primitives.
- 2026-05-24: After Wave 5 ships, every game route in the catalog has
  primitives + event machine coverage. The remaining audit-derived
  refinements (hooks for full-page Rainbet skin variant, additional
  Rainbet-specific carousel polish) are out of scope for this final
  wave and can be revisited later.