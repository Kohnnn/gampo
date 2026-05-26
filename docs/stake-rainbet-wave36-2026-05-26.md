# Stake/Rainbet Wave 36 - Slot Bonus Motion Polish

Date: 2026-05-26

## Scope

Closed Gap 4 from `docs/codex-handoff-prompt.md`: slot bonus states now have compact mid-bonus motion for wheel landings, hold-and-respin fills, free-spin retriggers, and cascade wins without adding external assets.

## What Changed

- `src/components/games/slots/slotsMotion.js`
  - Centralizes timing constants for wheel wobble, hold-tile pulse, retrigger flyers, and cascade traces.
  - Adds pure helpers for hold tile freshness, grid cell center lookup, retrigger flyer coordinates, and capped cascade trace cells.

- `src/components/games/slots/slotFactory.js`
  - Extends hold-and-respin feature events with `startFilledIndexes`, `filledIndexes`, and `newFillIndexes` so the UI can distinguish already-held tiles from newly landed tiles.

- `src/components/games/slots/SlotsGame.jsx`
  - Reuses the new motion helpers for transient retrigger flyers, cascade trace dots, and hold-tile state classes.
  - Uses a single reveal timestamp for wheel and hold overlays so bonus motion is deterministic inside the current result reveal.
  - Clears transient retrigger state on template changes and spin starts.

- `src/components/games/slots/slots.css`
  - Adds a short wheel landing wobble after the existing wheel spin.
  - Adds a brief pulse for only newly filled hold tiles.
  - Adds free-spin retrigger fly-in chips that travel from scatter cells to the free-spin counter.
  - Adds lightweight cascade trace dots over winning cells after cascades settle.
  - Extends reduced-motion fallbacks for all new motion layers.

- Tests
  - Added `src/components/games/slots/slotsMotion.test.js` for helper output, megaways/uniform cell centers, retrigger flyer coordinates, cascade trace caps, and timing constants.

## Verification

- Focused slot tests:
  - `npm test -- src/components/games/slots/slotsMotion.test.js src/components/games/slots/slotFactory.test.js`
  - Result: 17 tests across 2 files passed.

- Full suite:
  - `npm test -- --run`
  - Result: 143 tests across 30 files passed.
  - Note: npm still prints the existing `Unknown cli config "--run"` and `--localstorage-file` warnings.

- Production build:
  - `npm run build`
  - Result: built in 13.93s.
  - Existing warnings remain: empty `phaser` / `matter` chunks and large row chunks.

- Browser smoke:
  - `/slots` at 1440x900: verified an Iron Fist Bell Buy bonus state, wheel overlay, free-spin handoff, feature-event copy, and computed wheel animations `slotWheelSpin, slotWheelLandingWobble` with `1.25s, 0.35s`.
  - `/slots` at 390x844: verified the slot surface has no horizontal overflow with the new motion-layer CSS loaded.
  - Console remained clean in the live browser check except for normal Vite and React dev messages.
  - Screenshot:
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779716232443\wave36-slots-mobile-390x844.png`

## Notes

- No provider/source assets, new SVGs, or generated images were added.
- Browser smoke temporarily played a GC 350.00 practice bonus buy; persisted `gampo_credits` was restored to `508.4` afterward.
- Rare retrigger, hold-and-respin, and cascade visuals are driven by helper-tested state because those states are random-dependent in browser smoke.
- Remaining handoff gaps: mobile/tablet refinements and per-game polish leftovers.
