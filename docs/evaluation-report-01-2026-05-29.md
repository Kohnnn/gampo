# GamPo Evaluation Report 01 — 2026-05-29

## 1. Summary

Overall health: **yellow-green**. The baseline is stable after fixes: **151 tests / 33 files green** and `npm run build` is clean in **10.30s**. No remaining P0 blocker was left open.

Baseline verification:

- `npm install`: already up to date. NPM reports **15 vulnerabilities** (8 moderate, 7 high).
- `npm test -- --run`: final result **151 passed / 33 files**. NPM still warns `Unknown cli config "--run"` and Vitest prints repeated `--localstorage-file` warnings.
- `npm run build`: final clean build **10.30s**. Warnings remain for empty `phaser` / `matter` chunks and `rows-*` chunks over 1.5 MB.
- `node scripts/buildCsCollection.mjs`: wrote `cs-collection.json`, `cs-cases.json`, `cs2cap-rarity.json`.
- `node scripts/buildCsCollection.mjs --prices`: wrote `cs-prices.json` with **8,533** CSMarketAPI metadata rows; SteamAnalyst returned **HTTP 401** and the script continued.
- `node scripts/sliceSlotRankArt.mjs`: wrote **100** rank slices.
- `node scripts/stripSlotRankBg.mjs --atlases`: **109 processed, 0 skipped textured**.
- `node scripts/genSfx.mjs --bgm`: regenerated **114 BGM WAVs**.

## Fixes applied

- **P0 missing slot assets**: `applyRankArt()` was rewriting high symbols for early templates to PNGs that do not exist. Restricted high-symbol rewrites to templates that actually ship themed high-symbol art, while keeping rank-art rewrites. Added slot factory tests.
- **P0/P1 BGM unlock**: BGM initially failed in Chromium because the first `AudioContext.resume()` could hang or be blocked. Added unlock retry on user gesture plus resume timeout tests.
- **P1 Poker BGM gap**: wired `useGameBgm('poker', 'idle')`; verified `/audio/bgm/games/poker/idle.wav` fetches 200.
- **P0 fresh wallet**: a clean browser started at `GC 0.00` because `Number(null)` was treated as 0. Fixed fallback handling and added tests.
- **P0 game shell layout**: bet-panel CTA could shrink or sit below the viewport at 1365×768; stats aside also intercepted controls. Made CTA non-shrinking/sticky and contained aside overflow.
- **P0 mobile cases tab**: at 480px, the aside intercepted taps on the Collection tab. Contained mobile aside overflow; Collection now opens and renders 2 columns.
- **P1 CS tier distribution**: `Covert` tier had 0 playable cases. The builder now stratifies the 60 playable cases to **32 / 16 / 10 / 2** across Classified / Covert / Exceedingly Rare / Contraband.
- **P1 rare-drop logic**: broadened rare definitions to include `Restricted`, `Classified`, `Remarkable`, and `Exotic` where the UI/progress expected rarity >= Restricted.

## 2. Regressions

- No final test regressions.
- No final build errors.
- Runtime errors found and fixed during the audit:
  - `src/components/games/slots/slotFactory.js`: missing per-template high-symbol PNG references for early templates.
  - `src/audio/useBgm.js` / `src/audio/audioContext.js`: BGM could fail to start after the first blocked audio resume.
  - `src/context/CreditContext.jsx`: fresh localStorage initialized the wallet to 0 instead of `INITIAL_CREDITS`.
  - `src/components/games/primitives/primitives.css`: shared shell layout hid/intercepted primary play controls at common desktop/mobile viewports.

Open runtime issue:

- `src/sportsbook`: `/sports` static preview requests `/api/sportsbook/free-feed` and receives **404**. Repro: open `/sports` on the built preview. Suggested fix: add a static fallback/mock adapter for preview builds or guard the API call when the endpoint is unavailable.

## 3. UI/UX issues

- **P1**: Sidebar slot entries for `Vault Rush`, `River Catcher`, `Dust Rail Bounty`, `Storm Banner`, and `Bassline Bonus` all route to `/slots`; only the default template opens unless the in-game selector is used. Suggested fix: give each template a distinct route or query/deep-link.
- **P1**: ChatDock Progress tab renders achievements only. Missions and VIP data are tracked and mission toast fires, but the Progress panel does not render missions/VIP and only has one global reset button.
- **P1**: 1610×870 document fits, but slot playfield still has internal scroll (`playfieldScrollHeight 755 > clientHeight 679`), so the primary play resolution is not fully scroll-free.
- **P2**: Locked Collection tiles are dimmed but computed filter is `brightness(0.7)`, not grayscale. Requirement said greyscale with lock icon.
- **P2**: Several slot bonus mechanics are functionally present but visual indication is inconsistent: scatter pulse exists in CSS, but initial grids often contain no scatter; wheel/hold/retrigger animations need deterministic QA hooks or seeded demo triggers.

## 4. Audio gaps

- Manifest sanity: **167 audio references, 0 missing files**.
- `useSfx('crash').play('tick')` maps to `public/audio/crash/tick.wav`; file exists.
- Orphan WAVs under `public/audio/slots/`: `anticipation`, `cascadeStep`, `holdFill`, `moneyCollect`, `mysteryReveal`, `reelStop`, `reelTick`, `scatter`, `spinStart`, `stickyLock`, `wantedSlam`, `wheelLand`, `winLine`.
- `/sports` has generated `sports` BGM assets but no route playback in preview.
- Casino-game BGM bonus-mode assets exist, but most non-slot games still run `idle` only; no high-stakes state is wired for the bonus swap.

## 5. Asset gaps

- Slot rank art pass is healthy: **109/0 transparent atlas strip**, no final missing rank file refs found in browser sweep.
- Early templates still use classic high-symbol art by design after the P0 guard: vault/cash/coin, bait/wild, train/gold, storm wild, record/light/wild still need improved template-specific PNGs.
- No new image generation was run, and `scripts/genAssets.js` was not run.
- Case/collection remote item images resolve in tested flows; locked tiles render lock icon, but silhouette treatment needs grayscale polish.

## 6. Mobile / tablet bugs

- 375×667 `/slots`: no horizontal overflow; ChatDock tabs become icon-only; slot stage does not crop horizontally. Spin aria was not detected by the script because the stage spin button selector changed, but code has `aria-label="Spin"`.
- 480×800 `/cases`: fixed during audit. Collection tab now opens; grid is **2 columns** (`193px 193px`).
- 1024×768 `/sports`: sidebar correctly switches to sportsbook sections, but preview logs the free-feed API 404.
- 1610×870 `/slots`: page fits without document scrolling, but internal playfield scroll remains.

## 7. Accessibility issues

Axe findings on built preview:

- **Critical**: unlabeled inputs on cases/crash bet panels (`.bp-bet-input`, target multiplier input).
- **Serious**: nav section titles fail color contrast across `/slots`, `/cases`, `/crash`, `/sports`.
- **Serious**: `.gs-playfield` scrollable region is not keyboard-focusable on `/crash`.
- **Moderate**: `/sports` has duplicate/non-unique main landmarks and no page-level h1.

Spot checks:

- Game tools popover is portal-rendered; Tab reaches controls and Escape closes it.
- ChatDock tab order remains **Stats / Progress / Chat / Race**.
- Reduced-motion CSS exists for major toast/overlay/scatter surfaces, but sidebar pin and some game-specific animation effects need a complete reduced-motion audit.

## 8. CS data quality

- Final playable case distribution: `classified: 32`, `covert: 16`, `exceedingly: 10`, `contraband: 2`.
- `cs2cap-rarity.json`: **7,902** entries.
- `cs-prices.json`: **8,533** CSMarketAPI rows.
- SteamAnalyst `/v2` returned **401** and was handled gracefully; no retry loop was used.
- Rare-drop verification: Contraband 10-row open produced rare card + rare popover on first attempt; progress recorded `casesTotalDrops: 10`, `casesRareDrops: 1`.

## 9. Performance notes

- Build warning: `rows-8` through `rows-16` chunks are ~**2.0 MB** minified each. These should be lazy-loaded or moved behind explicit route/action boundaries.
- `cs-collection.json` is ~**8.40 MB** and `cs2cap-rarity.json` is ~**2.37 MB**; keep the collection load lazy and avoid mounting it before the Collection tab.
- Preview `/sports` 404 creates console noise and failed network work.
- BGM decode/play now works after user gesture, but browser audio unlock remains sensitive; keep regression tests around retry behavior.

## 10. Recommended next waves

1. **Wave A: Progress panel completion**
   - Files: `src/components/ProgressPanel.jsx`, `src/hooks/useMissions.js`, `src/data/missions.js`.
   - Acceptance: Progress tab shows Achievements, Missions, VIP; reset supports Achievements / Missions / VIP / Wallet scopes; `daily-3-games` evaluates numeric `uniqueGames.length`.

2. **Wave B: Slot route and asset completion**
   - Files: `src/components/Sidebar.jsx`, `src/components/games/slots/slotFactory.js`, `public/assets/games/slots/*`.
   - Acceptance: every sidebar slot opens its own template; no high-value symbols fall back to `slot-classic` for the first six themed templates; no broken image responses.

3. **Wave C: Case opening feel pass**
   - Files: `src/components/games/cases/CasesGame.jsx`, `src/components/games/cases/cases.css`.
   - Acceptance: reel/strip pacing resembles modern CS case opening, rare reveal has stronger timing and audio, locked silhouettes are true grayscale, filters/sort are covered by tests.

4. **Wave D: A11y cleanup**
   - Files: `src/components/games/primitives/BetPanel.jsx`, `src/components/games/primitives/primitives.css`, `src/components/Sidebar.jsx`, `src/sportsbook/*`.
   - Acceptance: axe critical/serious violations cleared on `/slots`, `/cases`, `/crash`, `/sports`; scrollable game regions are keyboard reachable; inputs have explicit accessible names.

5. **Wave E: Performance and audio polish**
   - Files: `vite.config.js`, `src/audio/*`, `src/sportsbook/*`, `scripts/bgmEngine.mjs`.
   - Acceptance: no chunks >1.5 MB; sports preview has no 404; casino high-stakes states can trigger bonus BGM; orphan slot SFX are either wired or removed.
