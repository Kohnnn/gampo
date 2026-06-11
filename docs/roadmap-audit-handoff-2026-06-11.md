# GamPo — Roadmap, Progress & Audit Handoff (2026-06-11)

> Audience: the next AI/engineer auditing and improving this codebase. This is the
> single source of truth for **what shipped**, **how it works**, **what is left**,
> and **how to verify everything**. Read this top-to-bottom before touching slots
> or cases code.

---

## 0. TL;DR

- **Project**: GamPo — an educational casino-simulator (practice credits only, no
  real money). React + Vite SPA, deployed to Netlify.
- **Production**: https://gampo-educational-simulator.netlify.app
- **Repo**: `D:\gampo`, GitHub `Kohnnn/gampo`.
- **Working branch**: `codex/gampo-polish-deploy` (this is what is live; main is behind).
- **State at this handoff**: 490 unit tests green, build clean, scroll/a11y/contrast
  audits pass, smoke clean. All planned **slots (S1–S4, S-anim, S-cal)** and the
  high-value **cases (C2, C4, C6, C7)** waves are shipped and deployed. C1/C3/C5
  deferred (reasons below).

---

## 1. How to run / verify (do this first)

Shell is **PowerShell (pwsh) on Windows**. A wrapper `rtk` prefixes node/npm/vitest.

```pwsh
# Unit tests (fast, ~20s) — the primary gate
rtk npm run test                 # full suite (vitest)
rtk npx vitest run src/components/games/slots/   # slots only
rtk npx vitest run src/components/games/cases/   # cases only

# Build
rtk npm run build                # vite build -> dist/

# Static + browser audits
rtk npm run audit:scroll         # static CSS scroll-contract audit
rtk npm run audit:a11y           # headless a11y
rtk npm run audit:contrast       # WCAG AA contrast
rtk npm run audit:all            # all of the above + betsheet

# Browser smoke (needs a preview server running first)
rtk npx vite preview --port 5173 --strictPort   # in one shell
rtk node scripts/browserSmoke.mjs --baseUrl=http://127.0.0.1:5173 --routes=/cases,/slots --viewports=390x844,1365x768 --label=check
```

### Slot RTP calibration / verification (IMPORTANT, has gotchas)

The slot engine imports `../utils/simulationMath` **without** a file extension, so
running the scripts under native node needs the ESM resolver loader:

```pwsh
# Recalibrate only the templates you changed (merge mode keeps the rest):
$env:SLOT_CAL_ONLY='gummy-drops,bassline-bonus'
rtk node --loader ./scripts/extResolve.mjs scripts/calibrateSlots.mjs
# writes src/components/games/slots/slotRtpScalars.js

# Verify only those templates (minutes, not the full grid):
$env:SLOT_VER_ONLY='gummy-drops,bassline-bonus'
rtk node --loader ./scripts/extResolve.mjs scripts/verifySlotRtp.mjs
```

- These runs take **5–30+ min** at 200k spins; launch them **detached** (see
  `scripts/runPreviewDetached.ps1` pattern) and poll the log, or they will hit the
  120s/600s tool timeouts.
- `slotRtp.test.js` is a fast unit-level guard that no template is player-favourable
  (RTP < 100%) — run it after any payout change instead of waiting for the full sim.
- The unit-level guard is authoritative for CI; the heavy `verifySlotRtp.mjs` is the
  release sign-off.

### PowerShell gotchas observed
- `cd X && $env:VAR='v'; cmd` fails to parse. Set env var first, use `workdir` param.
- `globalThis.navigator/window` are read-only in vitest — use `vi.stubGlobal`.
- Calibration/verify exceed default tool timeouts → run detached + poll the logfile.

---

## 2. Architecture orientation (slots + cases)

### Slots engine — `src/components/games/slots/slotFactory.js` (~1750 lines)
- `SLOT_TEMPLATES[]` — every game is a config object: `layout` (rows/cols/evaluation:
  lines|ways|cluster|pay-anywhere|megaways), `features{}`, `symbols[]`, `rtpTarget`,
  `volatility`, `rtpScalar` (auto-attached from `slotRtpScalars.js`).
- `resolveSlotSpin(config, options)` is the single resolver. Order of operations
  (critical for any new feature — insert at the correct stage):
  1. `pickSymbol` fills the grid · buy-tier guaranteed scatters · sticky wilds
  2. **`applyRandomFeature` (S4)** — pre-eval wild injection
  3. expanding wilds → stacked wild reels → scarab respin → mystery reveal
  4. money values · `evaluateBaseWins` (mode dispatch)
  5. **`cascadeTumble` (S1)** — records `cascadeFrames[]`
  6. multiplier zones → **`applyWildMultiplier` (S3)** → stacked lineBoost → scarab boost
  7. `multiplier = sum(wins)` → **`resolveMultiplierOrbs` (S2)** applies orb sum
  8. scatter/free-spins · wheel · hold-and-respin · coin meter · money · jackpot ·
     persistent multiplier
  9. `multiplier *= rtpScalar` → **max-win cap** → deferred orb feature event
- `roll(config, channel, rng)`: inject `rng` for deterministic tests/sims; production
  uses async-HMAC `nextRoll`. `__setSlotCalibrationRng` is the module-level seam.
- Non-pay symbol types excluded from wins: `scatter`, `coin`, `money`, `mystery`,
  **`orb`** (see `isPaySymbol`).

### Slots UI — `src/components/games/slots/SlotsGame.jsx` (~2200 lines)
- `finishRound()` consumes the resolver result, drives the cascade timeline
  (`buildCascadeTimeline` from `slotsMotion.js`), win rollup, feature flyers,
  announce banner, coin shower.
- `slotsMotion.js`: `buildCascadeTimeline(frames, {turbo, reduceMotion})` →
  timeline the renderer walks with setTimeout. Conservation guarantee: last entry
  is the settled board.

### Cases — `src/components/games/cases/`
- `CasesGame.jsx` (~1960 lines): state machine `idle→arming→lid→spin→slowdown→land→
  reveal→settled`, driven by `queueRevealTimer` setTimeout chain. **Reel motion is a
  single CSS transition** on `transform` (not rAF). Phases toggle CSS classes.
- `casesAnimation.js`: timing constants + `claimCaseSettlement` (the exactly-once
  payout guard — keep it the single gate for any new skip/abort path).
- `caseOpening.js`: roll engine, builds the 32-tile reel track with the real outcome
  forced at `CASE_PRIZE_INDEX = 28`.
- `caseEconomy.js`: pricing/EV/rarity drop weights (single source of truth).

### Shared
- `src/hooks/useSettings.js`: singleton settings (accent, density, reduceMotion,
  **haptics**). Applies to `<html>`. Storage key `gampo_settings_v1`.
- `src/utils/haptics.js`: `navigator.vibrate` wrapper (NEW this wave).

---

## 3. What shipped this wave (with commit refs)

Branch `codex/gampo-polish-deploy`. Three production deploys were made (one after
slots, one after the first cases batch, one after C2). All commits below are pushed.

### Slots — feature expansion
| ID | Commit | What | Templates | Math note |
|----|--------|------|-----------|-----------|
| S1 | `f8a19987` (UI) + `172d4fed` (engine) | Cascade tumbles replayed as real pop→collapse→refill via `cascadeFrames` + `buildCascadeTimeline`. Turbo halves, reduced-motion jumps to final, conservation test proves replay lands on settled cells. | all cascade templates | none (presentation of existing math) |
| S2 | `9af32b2c` (+`2b24decb` test tweak) | Multiplier orbs (Gates-style): non-pay `orb` symbol carries weighted 2–500×; on any winning spin the orb SUM multiplies the win. Orb UI chip + glow. **Event surfaced only when FINAL paid multiplier > 0** (guards against an extreme scalar rounding a win to 0 → phantom event). | gummy-drops, bassline-bonus | recalibrated; verify 94.0/94.1% |
| S3 | `36392b7e` | Wild multipliers: any win whose cells include a wild is scaled by a per-template factor. `applyWildMultiplier`, optional `perWild`/`maxStack`. | river-catcher ×2, dust-rail ×2, storm-banner ×3 | recalibrated; verify 94.3/93.4/94.7% |
| S4 | `f2ff0b63` | Random base-game feature: low-prob pre-eval wild injection. `mode:'wilds'` (scatter N) or `mode:'wildReel'` (one full column). Composes with expand/stack/wild-mult downstream. | blue-samurai (~3% wilds), ghostblade-strike (~2.5% wildReel) | recalibrated; verify 94.5/94.3% |
| S-anim | `f120e8b6` | Feature-announce ribbon (orbs/wild-mult/random) + CSS-only big-win coin shower. Both clear on next spin/reset; reduced-motion shows announce static, suppresses coins. | n/a | no math change |
| S-cal | (within each S commit) | Every touched template recalibrated via `SLOT_CAL_ONLY` merge mode and verified via `SLOT_VER_ONLY`. Both scripts gained allowlist env vars. | — | — |

### Cases — unbox polish
| ID | Commit | What |
|----|--------|------|
| C2 | `1e1b9c97` | Reel overshoots ~46px past the resting offset then springs back (`is-settling` 360ms cubic-bezier) to the **exact** final offset. Reduced-motion lands flat. Settlement math + `CASE_PRIZE_INDEX` unchanged. |
| C4 | `b37d2691` | Pre-reveal rarity flash: reel tiles desaturate during spin/slowdown so rarity colour can't leak the landing tile; on land/reveal colour snaps back with a white→rarity flash on the target. Reduced-motion safe. |
| C6 | `b37d2691` | Mobile dock primary button becomes **Skip** while a spin runs (desktop skip was panel-only). |
| C7 | `b37d2691` | Haptics: `src/utils/haptics.js` — setting-gated (default on), reduce-motion-off, throttled vibration. Wired into cases reel ticks (decelerating only), land, rare/win reveals; cancelled on skip+unmount. Settings page toggle. |

### Fixes made along the way
- `d540f6f7` — `drill.math.test.js` Monte-Carlo RTP gate was flaky (unseeded
  `Math.random` crossed the RTP<1 boundary ~1/150 runs at depth 8). Seeded with
  mulberry32 per depth. The analytic EV test already proved the game is never +EV.
- S2 phantom-win bug (described above) fixed by deferring the orb feature event.

### Test deltas
- Suite grew 454 → **490** unit tests (89 files). New: cascade timeline,
  orb/wild/random engine tests, S-anim contract tests, haptics util (8) + settings
  haptics (1), cases C2/C4 CSS contract tests.

---

## 4. Roadmap — remaining & deferred work

### Deferred this wave (NOT blocked — conscious risk tradeoff)
| ID | What | Why deferred | How to approach safely |
|----|------|--------------|------------------------|
| C1 | Replace the CSS-transition reel with a rAF engine driving transform + per-tile tick callbacks. | The exact transition string is locked by `casesCss.test.js:16` and the offset math by `casesAnimation.test.js`. Marginal UX gain over the already-smooth transition; high regression risk. | Build rAF in a new `reelMotion.js`, keep the CSS path behind a flag, update both test files in lockstep, A/B the feel. |
| C3 | Near-miss suspense: cosmetically seed a rare tile adjacent to the target; deceleration slowdown + heartbeat when a rare is adjacent. | Must be cosmetic-only (no math change) and not collide with C4's desaturation masking. Needs care so it never leaks the real result. | Seed in the reel-track builder (`caseOpening.js`) at non-target indices only; gate heartbeat on `case-phase-slowdown`. |
| C5 | Multi-open (×3/×5/×10) staggered settles + best-drop finale pulse + recap row; remove the 320px `.cases-rows` scroll cage. | Staggered settles need the `settling` state threaded into the separate `CaseMultiOpenGrid` component; `casesMultiGrid.test.jsx` + `casesLayout.test.js` are fragile JSX-string contracts. | Pass a `settling`/`settleDelays[]` prop into `CaseMultiOpenGrid`; keep all `data-case-*` attributes; update the multi-grid test deliberately. |
| S5 | Expanding special symbol (Book-of-Dead style): FS variant picks a symbol that pays scatter-style after expansion. | Stretch; needs a new FS-only resolver branch. | 1 template; add to `resolveSlotSpin` FS path, recalibrate. |
| S6 | Walking wilds: wild shifts one column per spin until it exits. | Stretch; threads through the existing sticky-wild mechanism. | 1 template; reuse `stickyWilds` option, shift indexes each FS. |

### Known risks / tech debt to audit
1. **gummy-drops scalar is extreme (`6.2e-7`).** The orb feature + 8×8 cluster +
   cascade + persistent multiplier creates a very heavy tail bounded by
   `maxWinMultiplier: 5000`. RTP verifies at 94.1%, but the scalar magnitude means
   typical small wins round toward 0 — **audit whether the player-facing win
   distribution still feels fair**, or lower orb top values / tighten weights.
   > **RESOLVED 2026-06-11 (finish wave).** Diagnosed with `scripts/diagGummyDist.mjs`:
   > orbs were landing on 100% of spins and max win never exceeded 1.51× — a flat,
   > broken distribution. Fixed by making the orb symbol rare (weight 3→0.12),
   > raising `clusterMin` 6→8, trimming orb values, and lowering the cap 5000→2000.
   > Scalar lifted 6.2e-7 → 1.83e-5; orb landing now ~24%, max win ~3.15×, a real
   > [2,5×) bucket appeared, RTP 93.9%. See `docs/roadmap-finish-wave-2026-06-11.md`.
2. **Concurrent-writer hazard.** During this wave another automated process was
   editing the same files (notably `slotFactory.js`), producing duplicate blocks and
   a duplicate S2 commit (`2b24decb`). Before editing, check `git log` and file
   mtimes for concurrent activity.
3. **`casesLayout.test.js` / `casesMultiGrid.test.jsx` are JSX-string contracts** —
   they break on innocuous refactors (data attributes, branch structure). Treat them
   as a spec; update deliberately, never delete.
4. **Heavy RTP verify is not in CI** (too slow). Only the unit-level `slotRtp.test.js`
   guards CI. Any payout change MUST be followed by a manual `verifySlotRtp.mjs` run
   for the touched templates before release.
5. **main branch is behind** `codex/gampo-polish-deploy`. Decide whether to merge.

---

## 5. Audit checklist for the next AI

Run these and confirm before trusting the codebase:

- [ ] `rtk npm run test` → expect ~490 passing, 0 fail.
- [ ] `rtk npm run build` → clean.
- [ ] `rtk npm run audit:all` → scroll/a11y/contrast/betsheet all pass.
- [ ] Smoke `/slots` and `/cases` on mobile (390x844) + desktop (1365x768) → 0
      overflow, 0 console errors.
- [ ] For each slots template touched (gummy-drops, bassline-bonus, river-catcher,
      dust-rail, storm-banner, blue-samurai, ghostblade-strike): run scoped
      `verifySlotRtp.mjs`, confirm realized RTP within tolerance of `rtpTarget`.
- [ ] Verify no template is player-favourable: `slotRtp.test.js` passes.
- [ ] Manually open each of the 7 changed slot templates in the browser; confirm the
      new feature fires visibly and the announce/coin-shower behave under both normal
      and reduce-motion.
- [ ] Cases: open a case on mobile, confirm overshoot/settle, rarity flash, Skip in
      the dock, and haptics (real device) all work; toggle Settings → Haptics off and
      confirm vibration stops.
- [ ] Confirm `git status` clean and HEAD pushed; verify prod asset hash in
      `dist/index.html` matches the deployed `https://...netlify.app/index.html`.

### Suggested improvement priorities (for Fable 5 / next model)
1. Audit + retune the gummy-drops orb economy (risk #1 above).
2. Implement C5 multi-open finale (highest remaining UX value, medium risk).
3. Implement C3 near-miss suspense (high "feel" value, must stay cosmetic).
4. Then C1 rAF reel (lowest priority — current motion is already good).
5. S5/S6 only if expanding the slot feature catalogue is a product goal.

---

## 6. Source-of-truth file index

| Concern | File |
|---------|------|
| Slot resolver + templates | `src/components/games/slots/slotFactory.js` |
| Slot UI / animation orchestration | `src/components/games/slots/SlotsGame.jsx` |
| Cascade timeline helper | `src/components/games/slots/slotsMotion.js` |
| Slot RTP scalars (generated) | `src/components/games/slots/slotRtpScalars.js` |
| Slot calibration / verify | `scripts/calibrateSlots.mjs`, `scripts/verifySlotRtp.mjs`, loader `scripts/extResolve.mjs` |
| Slot feature copy | `src/data/slotFeatureContracts.js` |
| Slot tests | `src/components/games/slots/*.test.js` |
| Cases component | `src/components/games/cases/CasesGame.jsx` |
| Cases animation constants + settlement guard | `src/components/games/cases/casesAnimation.js` |
| Cases roll engine | `src/components/games/cases/caseOpening.js` |
| Cases economy/rarity | `src/components/games/cases/caseEconomy.js` |
| Cases styles | `src/components/games/cases/cases.css` |
| Cases tests | `src/components/games/cases/*.test.{js,jsx}` |
| Settings store | `src/hooks/useSettings.js` |
| Haptics util | `src/utils/haptics.js` |
| Scroll audit | `scripts/auditPlayfieldOverflow.mjs` |
| Browser smoke | `scripts/browserSmoke.mjs` |
| Wave status board | `docs/uiux-wave-2026-06-10.md` |
| This handoff | `docs/roadmap-audit-handoff-2026-06-11.md` |
