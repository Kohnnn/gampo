# Stake/Rainbet Wave 33 close-out (sim-player strips)

- Captured at: 2026-05-25
- Gap closed: Gap 1 — sim-player feeds for non-Crash games.

## Scope shipped

### Shared primitive

- Added `src/components/games/primitives/simBetRows.js` with deterministic
  sim-row generation powered by `createRoundRng`.
- Reused the canonical Social roster/persona data from
  `src/context/SocialContext.jsx`; the roster is now exported for shared
  game surfaces instead of being copied per game.
- Added `<SimBetStrip />` in `src/components/games/primitives/`, with a
  capped 8-12 row dense feed showing player, persona, action, stake, and
  result.
- Persona bias is explicit:
  - whales generate larger stakes and longer / higher-volatility targets.
  - cautious players generate smaller stakes and safer / shorter targets.
  - analysts and streakers sit between those bands.

### Game integrations

- Mines: sim rows show revealed cell count, bomb count, and cashout or bust.
- Dice: sim rows show target side, win chance, rolled value, and settlement.
- Plinko: sim rows show row count, risk, bin landed, and multiplier.
- Limbo: sim rows show target multiplier and actual roll.
- Wheel: sim rows show risk preset, segment hit, and multiplier.
- Keno: sim rows show spot picks and matches.

Each target game emits one new sim row when a user round settles. Initial
rows seed the surface so the stage does not look empty before the first
round, then `prependSimBetRow()` keeps the visible feed capped at 10.

## Verification

- Baseline before edits:
  - `npm test` — 125 tests across 26 files passed.
  - `npm run build` — clean in 10.56s with existing empty-chunk and large
    Plinko row warnings.
- After edits:
  - `npm test -- --run` — 127 tests across 27 files passed. npm still
    prints its existing unknown `--run` config warning because the package
    script already invokes `vitest run`.
  - `npm run build` — clean in 14.87s with the same existing empty-chunk
    and large Plinko row warnings.
- Browser smoke:
  - `/dice` at 1440x900 rendered persona-varied `Sim dice` rows; playing
    one round prepended a new row and kept the feed capped at 10.
  - `/mines`, `/plinko`, `/limbo`, `/wheel`, and `/keno` rendered their
    expected strip titles with 9 initial rows.
  - `/mines` at 390x844 showed the compact strip without text overlap.

## Files touched

- `src/context/SocialContext.jsx` — exports `fakePlayers` and
  `personaTemplates`.
- `src/components/games/primitives/simBetRows.js` — new deterministic row
  builders and cap helpers.
- `src/components/games/primitives/SimBetStrip.jsx` — new shared renderer.
- `src/components/games/primitives/primitives.css` — dense strip layout,
  responsive row compaction, result tones.
- `src/components/games/primitives/index.js` — exports the new primitive
  and helpers.
- `src/components/games/{mines,dice,plinko,limbo,wheel,keno}/*Game.jsx` —
  sim strip state and per-round row emission.
- `src/components/games/primitives/simBetRows.test.js` — persona bias and
  roster-cap coverage.
- `progress.md` — handoff progress note for this wave.

## Status

Wave 33 — shipped. Remaining gaps: smarter poker bot, CS case animation
polish, slot bonus mid-flight motion, mobile/tablet refinements, and
per-game polish leftovers.
