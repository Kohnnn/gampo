# Evaluation Report 02 - 2026-05-29

## 1. Summary

Health: yellow-green. The implementation from Report 01 is materially improved: tests are green, the build is clean, the new first-five slot routes resolve, Sportsbook no longer exposes the optional static-preview feed miss as user-facing warning UI, and the key casino/sports/cases routes render without console errors.

Validation run:
- `npm test -- --run`: 38 files, 163 tests passed.
- `npm run build`: clean, 36.66s on the final standalone run.
- Local redeploy: Vite preview running at `http://127.0.0.1:4173`.
- HTTP route smoke: `/vault-rush`, `/river-catcher`, `/dust-rail`, `/storm-banner`, `/bassline-bonus`, `/cases`, `/sports`, and `/slots` all returned 200.
- Browser smoke: `/vault-rush`, `/river-catcher`, `/sports`, and `/cases` rendered with no runtime errors; only the expected Web Audio user-gesture warning appeared.

Showstoppers: no P0 runtime blocker found. One invariant is now failing locally: the standalone build exceeded the 30s target by 6.66s. Treat that as a P1 performance regression until a clean machine run disproves it.

Deployment note: no root production deploy config was found for Vercel, Netlify, Cloudflare, or similar. This evaluation used the built Vite preview as the deploy target.

## 2. Regressions

### P1 - Build time exceeds invariant

- File path: generated build graph, strongest suspect under `src/components/games/plinko/engine/rows-*.js`.
- Repro: run `npm run build`.
- Result: build succeeds but reports `built in 36.66s`, above the 30s invariant.
- Suggested fix: compress or algorithmically regenerate the Plinko row outcome payloads instead of bundling nine 2.0 MB dynamic row chunks. Do not hide this by raising `chunkSizeWarningLimit`.

### P2 - Build warnings remain

- File path: Vite/Rollup output.
- Repro: run `npm run build`.
- Result: empty chunks `phaser` and `matter`; Plinko chunks `rows-8` through `rows-16` remain larger than 1.5 MB.
- Suggested fix: remove empty manual chunk aliases if they are stale, and handle Plinko data representation separately.

No test failures were observed. No route-level runtime errors were observed in the focused browser smoke.

## 3. UI/UX Issues

### Verified Improvements

- First-five slot aliases now open the intended templates from the sidebar and direct URLs.
- Sidebar slot section lists per-template paths, including the first-five aliases.
- Progress panel now exposes Achievements, Missions, VIP, and scoped resets in the same ChatDock surface.
- Sportsbook has a page-level `h1` and renders as `Sports Home` inside the shared layout.
- Cases loads the four-tier model and resolves from the initial loading state to non-zero Classified / Covert / Exceedingly Rare / Contraband counts.

### Remaining Issues

- P2: Cases can briefly show `Tier (0 cases)` and `Loading stage...` before data resolves. This is not a blocker, but the transient state is visibly rough on a cold preview load.
- P2: Full interactive animation validation was not rerun in this pass: slot spin-triggered scatter pulse, wheel landing wobble, hold pulse, retrigger fly-in, and case reveal phase timing need another Playwright run with click controls or a dedicated test harness.
- P2: Mobile viewport matrix was not rechecked in this redeploy pass. Previous planned fixes should be verified at 375x667, 480x800, 1024x768, and 1610x870.

## 4. Audio Gaps

- Sportsbook now calls `useGameBgm('sports', 'idle')`.
- Crash, Mines, Cases, and Slots have limited high-stakes or bonus-mode BGM triggers where signals already existed.
- Browser smoke still reports the expected Chromium Web Audio warning before first user gesture. This is browser policy, not a runtime failure.
- Higher-quality licensed/open-source SFX/BGM replacement remains deferred. Current procedural WAVs are still used.
- Full route-to-archetype listening verification across all 36 casino routes was not repeated in this pass.

## 5. Asset Gaps

- No new generated slot assets or atlas regeneration were performed.
- First-five slot routes render themed template symbols in the accessibility tree.
- Missing-art review remains open for templates that still rely on classic fallback symbols where no matching local PNG exists.
- Locked collection images now have CSS coverage for true grayscale; visual verification should be repeated after opening the Collection tab interactively.

## 6. Mobile / Tablet Bugs

Not fully revalidated in this redeploy pass due the available browser tool lacking viewport resizing and click automation.

Carry forward:
- Verify 375x667: slot wheel and hold overlay do not crop; ChatDock labels collapse correctly below the narrow container threshold.
- Verify 480x800: Cases Collection grid uses two columns and locked silhouettes remain legible.
- Verify 1024x768: sidebar context switching between Games and Sports remains usable.
- Verify 1610x870: slot playfield fits without internal scroll after the tightened stage constraints.

## 7. Accessibility Issues

Verified source-level improvements:
- ChatDock tab order remains Stats / Progress / Chat / Race.
- ChatDock width remains locked at 400px for normal dock states.
- Game playfields are focusable regions with accessible labels.
- Bet controls gained explicit labels or aria-labels in shared and game-specific panels.
- Sportsbook avoids nested page-level `main` and exposes a page-level `h1`.

Remaining:
- P2: Run axe or pa11y against the built preview once an a11y runner is added locally.
- P2: Manual keyboard pass still needed for GameToolbar portal popover, ChatDock tabs, Collection controls, and scrollable playfields.
- P2: Reduced-motion coverage for new case timing and slot feature classes should be checked in-browser, not only by CSS inspection.

## 8. CS Data Quality

- `/cases` loads the four public tiers and resolves to non-zero counts in the focused smoke: Classified 32, Covert 16, Exceedingly Rare 10, Contraband 2.
- Case and Collection remain in the same game surface.
- Collection copy is user-facing as Collection, not Pokedex, in the checked routes.
- `cs-collection.json` remains lazy-loaded through the Collection path rather than on every hook import.

Not repeated in this pass:
- `node scripts/buildCsCollection.mjs --prices`.
- csmarketapi entry count validation.
- cs2cap rarity coverage diff.

## 9. Performance Notes

- P1: build time is now the main risk. The final standalone build took 36.66s.
- P1: Plinko dynamic row chunks are still about 2.0 MB each minified and about 872-882 KB gzip each.
- P2: `cs-collection.json` is still large, but lazy-loading keeps it off initial non-Collection loads.
- P2: Browser smoke did not expose route-level runtime errors, but no animation frame/jank profiling was performed.

## 10. Recommended Next Waves

### Wave A - Build Budget Recovery

Files:
- `src/components/games/plinko/engine/plinkoOutcomesLoader.js`
- `src/components/games/plinko/engine/rows-*.js`
- Plinko generation script, if present.

Acceptance criteria:
- `npm run build` completes under 30s on this machine.
- Plinko row chunks drop below the 1.5 MB warning threshold or are represented in a clearly cheaper generated/compressed format.
- Existing Plinko math tests remain green.

### Wave B - Automated Browser Smoke

Files:
- Add a Vitest or Playwright smoke suite under `src/**` or `tests/**`.
- Cover slot aliases, Sportsbook preview fallback, Cases cold load, and ChatDock invariants.

Acceptance criteria:
- First-five slot aliases mount without `console.error`.
- `/sports` does not surface optional feed warnings on Vite preview.
- `/cases` resolves from loading to populated tier counts.
- ChatDock tab order and 400px width are asserted.

### Wave C - Interaction And Motion Verification

Files:
- `src/components/games/slots/slotsMotion.js`
- `src/components/games/slots/SlotsGame.jsx`
- `src/components/games/cases/CasesGame.jsx`
- `src/components/games/cases/cases.css`

Acceptance criteria:
- Deterministic QA hooks can trigger scatter pulse, wheel wobble, hold pulse, and retrigger fly-in without player-facing controls.
- Case lid lift, light streak, prize zoom, skip animation, and rare reveal can be verified by automated or scripted browser steps.
- `prefers-reduced-motion: reduce` disables or shortens all new motion.

### Wave D - Full Device And A11y Pass

Files:
- `src/components/ChatDock.css`
- `src/components/games/slots/slots.css`
- `src/components/games/cases/cases.css`
- `src/sportsbook/sportsbook.css`

Acceptance criteria:
- Manual or automated screenshots pass at 375x667, 480x800, 1024x768, and 1610x870.
- axe/pa11y reports no critical or serious issues on `/slots`, `/vault-rush`, `/cases`, and `/sports`.
- Keyboard users can reach and escape GameToolbar, ChatDock tabs, and all bet controls.

## Fixes Applied During This Evaluation

None. This pass redeployed the current app, verified the implemented plan, and documented the new build-time regression for follow-up.
