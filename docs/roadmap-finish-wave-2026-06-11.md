# GamPo — Roadmap Finish Wave (2026-06-11)

> Continuation of `docs/roadmap-audit-handoff-2026-06-11.md`. This wave closes the
> three **high-value** remaining items from that handoff's priority list:
> P1 (gummy-drops orb economy — audit risk #1), P2 (C5 multi-open finale), and
> P3 (C3 near-miss suspense). S5/S6 (new slot games) and C1 (rAF reel) were
> consciously **out of scope** per product direction (no new slot games; current
> CSS reel motion is already good).

Branch: `codex/gampo-polish-deploy`.

---

## P1 — gummy-drops orb economy retune (audit risk #1)

### The problem (quantified)
Built a diagnostic (`scripts/diagGummyDist.mjs`) that measures the *player-facing*
win distribution, not just mean RTP. At the start of this wave, gummy-drops with
scalar `6.19572e-7`:

| Metric | Before |
|--------|--------|
| Orb landing rate | **100%** of spins (avg 7.83 orbs/spin, avg orbSum 47.8) |
| Max round seen (120k spins) | **1.51×** |
| Win distribution | 57% in [0.5,1), 41% in [1,2), **0% above 2× ever** |

Root cause: the `orb` symbol had weight `3` on a 64-cell board → orbs landed every
spin, and `clusterMin: 6` meant the common low symbols always formed a paid
cluster. Every spin was multiplied by a ~48× orb sum, driving raw RTP into the
tens-of-thousands, which forced calibration to a near-zero scalar. That scalar
then rounded almost every win into a flat [0.5, 2×] band via `round2`. The
advertised 5000× max-win cap was pure fiction (nothing ever exceeded ~1.5×). For
a "Very high" volatility title this is a broken, flat experience.

### The fix (per "lower the ceiling" recommendation)
`src/components/games/slots/slotFactory.js`, gummy-drops template:
- **Orb symbol weight `3 → 0.12`** — orbs become a genuine feature (~24% of spins,
  avg ~1.2 orbs when they land) instead of wallpaper.
- **`clusterMin: 6 → 8`** — 8+ of a kind pays (Sweet-Bonanza style); a paid cluster
  is now a real probabilistic event, not a guaranteed floor.
- **Orb values `[2,3,5,10,25,50,100,250] → [2,3,5,8,12,20,50,100]`** and weights
  tightened — bounded per-orb ceiling.
- **`maxWinMultiplier: 5000 → 2000`** — a reachable, honest top end (the old ceiling
  was never reached once the scalar crushed the tail).

### Result (after recalibration → scalar `1.8251e-5`, a 29× lift)

| Metric | Before | After |
|--------|--------|-------|
| Realized RTP | 94.14% | **93.92%** (target 94.0, tol 5%) |
| Orb landing rate | 100% | **23.75%** |
| Max round seen | 1.51× | **3.15×** |
| [2,5) win bucket | 0% | **6.25%** |
| Hit rate | 99.13% | 96.25% (correct for "Very high" volatility) |

The win distribution now has a real shape: orbs are a feature that lands ~1 in 4
spins, bigger wins exist, and the math still verifies at target RTP. The hit-rate
drop is the intended tradeoff — fewer, more meaningful wins.

### Calibration / verification
- Recalibrated scoped: `SLOT_CAL_ONLY=gummy-drops node --loader ./scripts/extResolve.mjs scripts/calibrateSlots.mjs`
  → updated `slotRtpScalars.js` gummy-drops to `1.8251e-5`.
- Verified scoped: `SLOT_VER_ONLY=gummy-drops` (5 seeds × 80k spins) within the 5%
  extreme-variance tolerance band.
- `slotRtp.test.js` (no template player-favourable) stays green.
- **NOTE for next engineer:** calibration/verify on the 8×8 board are *very* slow
  (the fixed-point cap solver × 3 seeds). Run them fully detached to a logfile via
  `Start-Process pwsh -WindowStyle Hidden -File <wrapper>` and poll the child node's
  CPU ticks (`Get-CimInstance Win32_Process`), not the wrapper's. The `rtk` wrapper
  and `Start-Job` both blocked/died across tool calls in this environment.

### Test change
`slotFactory.test.js` "surfaces orb values…" was rewritten: it now clones the
template and **boosts the orb weight to 40** to deterministically force orb+win
co-occurrence, instead of relying on a uniform RNG hitting a now-rare orb. The
real template keeps its rare weight; the test still asserts the application logic.

---

## P2 — C5 multi-open finale

Files: `CasesGame.jsx`, `cases.css`, `casesMultiGrid.test.jsx`, `casesCss.test.js`.

- **Staggered settles**: in a ×10 bulk open the rows now settle in a wave
  (`CASE_MULTI_SETTLE_STAGGER_MS = 110`) instead of all at once. New `settledRows`
  state is filled progressively by per-row timers inside the `land` phase; the
  budget (land→finish ≈ 1680ms) comfortably fits the 10-row × 110ms cascade.
  Reduced-motion settles all rows flat immediately.
- **Best-drop finale pulse**: `finishPendingRound` computes the highest-`valueGc`
  row into `finaleRow`; that `.cases-multi-slot` gets `is-finale` (a 2× celebratory
  `caseFinalePulse`) and a "Top drop" label.
- **Per-row settle animation**: `is-row-settled` rows play `caseRowSettle` (a small
  lift/scale) as they lock.
- **Removed the 320px scroll cage**: `.cases-rows` lost `max-height: 320px` +
  `overflow-y: auto` (and the `.has-result` 250px override). The grid now flows
  naturally — no cramped inner scroll.

Contract safety: the fragile `casesMultiGrid.test.jsx` / `casesLayout.test.js`
string contracts are preserved — `data-case-row-index` (×10) and
`data-case-target="true"` (×10) counts unchanged, no new `data-game-action`. New
props default to off so existing renders are unaffected (covered by a new test).

---

## P3 — C3 near-miss suspense (cosmetic only)

Files: `caseOpening.js`, `CasesGame.jsx`, `cases.css`, `caseOpening.test.js`,
`casesCss.test.js`.

- **Cosmetic rare seeding** (`buildCaseReelTrack`, opt-in `nearMiss` flag): when the
  real outcome is **not** rare, seed a rare tile at `CASE_PRIZE_INDEX ± 1` (never the
  target). The forced outcome at index 28 is the last write and is never touched, so
  `summarizeCaseSettlement` and all payout math are identical. New `isRareCaseItem`
  helper reuses `CASE_CELEBRATION_RARITIES`.
- **Round wiring** (`createCaseOpeningRound`): rolls a near-miss for a minority of
  non-rare spins (`nearMissChance = 0.34`) and exposes a round-level `nearMiss` flag.
- **Slowdown heartbeat** (`CasesGame.jsx`): on `slowdown`, if the round flagged a
  near-miss (and not reduced-motion), set `case-near-miss` on the stage + fire a
  gentle `select` haptic. Cleared on `land` and in `finishPendingRound`.
- **CSS** (`cases.css`): `caseNearMissPulse` (pointer scale + box-shadow) and
  `caseNearMissGlow` (frame inset glow), scoped to
  `.case-near-miss.case-phase-slowdown`. Deliberately uses the **transform/box-shadow
  channel only — never `filter`**, which is C4's anti-leak desaturation channel, so
  C3 cannot reveal the result early. Reduced-motion kills the heartbeat.

Tests: `caseOpening.test.js` proves the target tile is never overwritten, rares only
seed adjacent, no seeding when the outcome is already rare, and the `nearMissChance:0`
kill-switch. `casesCss.test.js` asserts the heartbeat exists, avoids `filter`, and is
reduced-motion safe.

---

## Gates (all green)

| Gate | Result |
|------|--------|
| `npm run test` (full) | **500 passed** (89 files; was 490 → +10 new C3/C5 tests) |
| `npm run build` | clean (10.3s) |
| `npm run audit:all` | a11y / contrast / scroll / betsheet all PASS |
| `browserSmoke` /cases /slots @ 390x844 + 1365x768 | 0 overflow, 0 console errors |
| `slotRtp.test.js` | no template player-favourable |
| gummy-drops scoped `verifySlotRtp` | within tolerance (5 seeds × 80k) |

## Artifacts
- `scripts/diagGummyDist.mjs` — reusable win-distribution diagnostic (kept for future
  orb/economy audits). Run `DIAG_ONLY=<id> DIAG_SPINS=N node --loader ./scripts/extResolve.mjs scripts/diagGummyDist.mjs`.
