// Shared slot engine constants. Kept dependency-free (no React, no imports) so
// both the browser bundle and the ESM calibration scripts (scripts/*.mjs) can
// import it without pulling in the rest of the engine.

// A realistic hard cap on total free spins played per bonus session. Bounds the
// calibration/verify simulation loops and matches how the live game caps a
// session's retrigger expansion. Single source of truth for:
//   - scripts/calibrateSlots.mjs
//   - scripts/verifySlotRtp.mjs
//   - src/components/games/slots/slotRtp.test.js
export const MAX_FREE_SPINS_PER_SESSION = 20
