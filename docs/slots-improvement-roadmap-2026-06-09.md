# Slots Improvement Roadmap — 2026-06-09

Owner scope: `src/components/games/slots/**`, `src/data/slotRoutes.js`, `src/data/slotRtpScalars.js`, slot scripts (`scripts/calibrateSlots.mjs`, `scripts/verifySlotRtp.mjs`).
Do NOT edit outside this scope without coordinating (shared files: `primitives/`, `gameDefinitions.js`, `browserSmoke.mjs`, `EducationPanel.jsx`).

## Context
20 data-defined templates through one engine (`slotFactory.js` `resolveSlotSpin` :1364). Evaluation modes: lines/ways/megaways/cluster/pay-anywhere. RTP is calibrated via per-template scalars in `slotRtpScalars.js`. Recent feature work (win tiers, anticipation, bonus-buy EV, slam-stop, how-it-pays, sparkline, FS HUD trail, portaled mobile dock) is all present and verified.

## Gates (every ship must pass)
- `rtk vitest run` (full suite green)
- `rtk npm run build` (OK; lazy `rows-*` chunk warning expected)
- `node scripts/verifySlotRtp.mjs` → ALL TEMPLATES WITHIN TOLERANCE, EXIT 0
- `node scripts/browserSmoke.mjs --routes=/slots,/slots-lobby --viewports=390x844,466x704,492x820,1365x768` → 0 overflow / 0 errors
- ux=100 on `/slots`; bet-sheet/a11y/contrast unaffected
- Deploy via `netlify deploy --prod --dir dist` (GitHub auto-deploy lagging); verify live asset hash == local.

## Tasks

### P0 — Correctness (bug-risk first)
- [ ] **S-P0-1 paytable mode bug**: `slotPaytable.js:28` reads `config.evaluation` but real templates store mode at `config.layout.evaluation` → every template renders as a "lines" ladder. Fix to read `config.layout?.evaluation || config.evaluation || 'lines'`. Add a test that loads REAL templates (not synthetic) and asserts the rendered mode matches `template.layout.evaluation` for all 20.
- [ ] **S-P0-2 maxWin field bug**: `slotPaytable.js:84` reads `config.maxWinMultiplier` but engine/data use `config.features.maxWinMultiplier` (`slotFactory.js:1627`, gummy-drops :711). Fix the field path; test that gummy-drops surfaces its cap.
- [ ] **S-P0-3 feature-contract drift**: `slotFeatureContracts.js` claims mechanics the engine lacks (dust-rail "sticky expanding wilds"/"retriggers +3"; bars "60x jackpot"/"bonus entry" vs 30x and no bonus; iron-fist wheel "2/4/8/15/30x" vs config `[2,3,5,10,20]`). Reconcile docs to actual engine values (prefer fixing the doc text; only touch engine if a value is clearly wrong). Add a test asserting contract claims that reference numeric values match config where checkable.

### P1 — Consistency & education
- [ ] **S-P1-1 dedupe magic 8**: big-win threshold `8` appears in 3 independent places (`SlotsGame.jsx:545`, `BigWinOverlay threshold={8}` :1721, `winTier` 'big' min). Extract one exported `SLOT_BIG_WIN_THRESHOLD`.
- [ ] **S-P1-2 dedupe FS cap**: `MAX_FREE_SPINS_PER_SESSION=20` is a literal in `calibrateSlots.mjs:48`, `verifySlotRtp.mjs:51`, `slotRtp.test.js:25`. Export one constant and import everywhere.
- [ ] **S-P1-3 real EV into EducationPanel**: `SlotsGame.jsx:1725` passes fixed `winProbability={0.28}`/`payoutMultiplier ...||2.4`. Derive from the active template (rtpTarget, hit frequency, volatility).
- [ ] **S-P1-4 autoplay absolute limits**: slot autoplay stops are %-of-baseline only. Add absolute currency loss/win caps + single-win cap matching SessionGuard semantics; surface a compact stop summary on the dock (not only the drawer).

### P2 — Depth
- [ ] **S-P2-1 graduated win rollup**: `rollupValue` helper exists but is unused in `SlotsGame.jsx`; wire a count-up for nice/good/great tiers (only ≥8× fires BigWinOverlay today).
- [ ] **S-P2-2 turbo/instant tier**: turbo is a single boolean; add an instant-resolve (skip animation) distinct from slam-stop.
- [ ] **S-P2-3 a11y**: reel grid labeled region, win-tier announcement (aria-live), spin keyboard shortcut, reduced-motion also shortens reel spin/cascade.

## Status board
| Task | Priority | Status | Commit | Notes |
|---|---|---|---|---|
| S-P0-1 paytable mode | P0 | DONE | (this batch) | reads config.layout.evaluation; real-template test added |
| S-P0-2 maxWin field | P0 | DONE | (this batch) | reads config.features.maxWinMultiplier; gummy-drops test |
| S-P0-3 contract drift | P0 | DONE | (this batch) | dust-rail/bars(30x)/iron-fist([2,3,5,10,20]) reconciled; note: iron-fist featureText in slotFactory.js:544 still says 2x-30x (engine file, deferred) |
| S-P1-1 magic 8 | P1 | DONE | (P1 batch) | SLOT_BIG_WIN_THRESHOLD exported from slotWinPresentation.js, used by tier min + SFX gate + BigWinOverlay |
| S-P1-2 FS cap | P1 | DONE | (P1 batch) | MAX_FREE_SPINS_PER_SESSION in new slotConstants.js; imported by 2 scripts + slotRtp.test |
| S-P1-3 EV panel | P1 | DONE | (P1 batch) | deriveEducationEv() from rtpTarget+volatility; blends live multiplier |
| S-P1-4 autoplay limits | P1 | DONE | (P1 batch) | absolute loss/gain/single-win caps in autoplay loop + dock stop summary |
| S-P2-1 win rollup | P2 | todo | | |
| S-P2-2 turbo/instant | P2 | todo | | |
| S-P2-3 a11y | P2 | todo | | |
