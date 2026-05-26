# CODEX `/goal` handoff prompt — GamPo final polish pass

Paste the block below into Codex's `/goal` command. It's a single self-contained brief with all context, current state, and exact gaps to close.

---

You are working on **D:\gampo**, a Vite + React educational fake-credit casino app called **GamPo** with extensive Stake/Rainbet-style polish across 32 prior waves. Tests are at **125/125 across 26 files** and build is **8.5 s clean**. Every prior wave has a close-out doc in `docs/stake-rainbet-*.md`.

## Your goal

Close the remaining gaps below. Ship in vertical slices, run `npm test -- --run` and `npm run build` between each, never break the green bar. Document each wave in a new dated file `docs/stake-rainbet-wave-<N>-2026-05-25.md`. **Skip any task that needs new SVG asset creation or 9router image generation** — the user has explicitly said no more of either. Reuse existing PNGs, audio, and procedural data files only.

## Repo orientation

- Vite + React 18, no TypeScript. JSX only. ESM modules.
- Tests are Vitest in `node` env; localStorage is shimmed per-test (see `useGlobalPnl.test.js`).
- Module-scope listener pattern is used for all state hooks (`useGlobalPnl`, `useProgress`, `useMissions`, `useCaseCollection`, `useSidebarPins`, `useCsCollection`).
- Game session records flow: `useGameSession.record()` -> `recordPnl` + `recordRound` (progress) + `recordMissionRound` (missions). Cases also call `recordCaseDrop`.
- Casino routes live under `src/components/games/<id>/` with a shared `GameShell` + `BetPanel` + `StatsOverlay` + `HistoryDrawer` primitive set in `src/components/games/primitives/`.
- Sportsbook routes live under `src/sportsbook/`. Sidebar adapts via `useLocation()` and dispatches `gampo:sports-navigate` events.
- ChatDock has 4 tabs: **Stats / Progress / Chat / Race**, locked at 400px, default tab is `stats`.
- Audio: `src/audio/audioContext.js` exposes 3 gain buses (master / BGM / SFX) with persisted volumes. `useSfx(slug).play(role)` for one-shots. `useBgm(skinFamily, mode)` loops; mode = `idle | bonus`.
- All 16-bit WAVs are procedurally generated via `node scripts/genSfx.mjs` (45 SFX + 38 BGM = 83 binaries, plus 11 case variants and 13 cross-game files).
- CS collection is generated via `node scripts/buildCsCollection.mjs --prices`. Output lands in `public/data/cs-collection.json` (8.4 MB), `cs-cases.json` (389 KB playable subset), `cs-prices.json` (2.2 MB metadata).
- Slot rank PNGs: 20 atlases × 5 ranks (J/Q/K/A/10) = 100 per-rank files at `public/assets/games/slots/<skin>/slot-rank-<template-id>-<rank>.png`. Wired via `applyRankArt(config)` in `src/components/games/slots/slotFactory.js`.

## Current build invariants — do not break

1. `npm test -- --run` → 125/125 across 26 files green. New tests welcome; never delete or skip existing tests.
2. `npm run build` → clean, < 15 s. Main entry ~123 KB / 35 KB gzip.
3. `node scripts/genSfx.mjs --bgm` → 19 idle + 19 bonus BGM loops.
4. `node scripts/buildCsCollection.mjs` → regenerates cs-collection.json + cs-cases.json deterministically.
5. ChatDock tab order **must stay**: Stats / Progress / Chat / Race.
6. ChatDock width **must stay locked at 400 px** (no per-tab resize).
7. Game tools popover **must stay** portal-rendered (escape titlebar).
8. Slot factory `applyRankArt()` **must stay** transparent (no UI mention; just rewrites asset paths).
9. SteamAnalyst /v2 endpoint returns 401 on the user's current token tier — **do not re-attempt SteamAnalyst price calls**. The price-source code path is in place under `scripts/buildCsCollection.mjs` for when the user upgrades the key.
10. **No new image generation.** No 9router calls. No new SVG icon authoring. Reuse what's already on disk.

## Gaps remaining (close these)

### Gap 1 — Sim-player feeds for non-Crash games (HIGH)

Crash already has 10–16 persona-biased sim players via `simulatePlayers(bust)` in `src/components/games/crash/CrashGame.jsx` and `PlayerStrip.jsx`. Add equivalent strips to:

- **Mines** — sim players reveal cell counts and cashout multipliers; e.g. "lucky_lemur revealed 4 / cashed @2.4×".
- **Dice** — sim players showing target / win-chance / settlement.
- **Plinko** — sim ball drops with row count + bin landed.
- **Limbo** — sim target × actual roll.
- **Wheel** — sim segment hit + multiplier.
- **Keno** — sim spot picks + matches.

Reuse the 18-player roster + persona templates from `src/context/SocialContext.jsx` (`fakePlayers`, `personaTemplates`). Whales should bias higher bets / longer targets, cautious players the opposite. Ship a single shared `<SimBetStrip />` primitive in `src/components/games/primitives/` rather than duplicating per game. Each game emits one sim row per round it plays. Cap the strip at 8–12 visible rows.

Tests: add 1–2 deterministic tests covering persona distribution and roster cap, mirroring `crash.math.test.js` shape.

### Gap 2 — Smarter poker bot (HIGH)

`src/poker/bots/HeuristicBot.js` was last touched 2026-05-24 and is still Wave 11 vintage. The user explicitly asked for a smarter bot during Wave 28. Improvements to ship:

- Persona injection — accept a `persona` prop (`tight-passive`, `loose-aggressive`, `whale`, `cautious`, `analyst`). Each persona biases vpip/pfr, c-bet frequency, fold-to-3-bet, river bluff frequency.
- Postflop equity sample bump from 150 → 250 rollouts when stack-to-pot ratio < 4.
- Use postflop GTO chart frequencies from `/data/poker/postflop.json` as a soft anchor when texture matches; fall back to heuristics otherwise. The chart loader already exists at `src/poker/gto/loader.js`.
- River turn-cards-up bluff frequency by persona band (whale 25 %, loose-aggressive 18 %, tight-passive 4 %).
- Add `Game.watchdog.test.js`-style coverage: deterministic hand seed → expected action distribution per persona.

Per-seat persona is already on the roster shape. Wire a per-seat persona prop into Game.js and PokerGame.jsx so seats actually carry distinct play styles.

### Gap 3 — CS case animation polish to match feel of `KingofKFCJamal/CaseClicker` (HIGH)

**Do not pull the source code repo.** Just match the *feel* using existing assets and primitives:

- Carousel spin already runs 3.5 s cubic-out + ±7 px jitter. Keep that.
- Add a subtle **camera zoom** on the prize tile during the last 600 ms of the spin so the chosen tile fills more of the frame (CSS scale ≈ 1.02 → 1.18 with translateZ for compositor-only animation).
- Add a **vertical light streak** sweeping across the carousel viewport in the last 1 s before settle.
- Add a **case-lid lift** SVG/CSS sequence that runs on click before the carousel kicks off (short ~250 ms). The lid is a CSS pseudo-element on the case card; no new image asset.
- After settle, the prize card pops up center-screen with a **mini-celebration** for any rarity ≥ Restricted: gold radial halo + 18 confetti particles using the existing `cases-particles` mark.
- Hook `cases/multispin.wav` as the lid pop, `cases/lid.wav` as the lift, and the existing `cases/rare.wav`/`cases/knife.wav` stay on rare drops.

Stretch: add a "skip animation" button in the bet panel that resolves the round instantly while still playing the SFX and recording the drop.

### Gap 4 — Slot bonus animations beyond banners (MEDIUM)

Banners are already polished (radial halo + 60–100 px glow + inset stripe). What's missing is **mid-bonus motion**:

- Wheel landing: the wheel-disc spin ends with a damped-spring wobble for 350 ms before locking on the value. Currently it cuts straight to the result.
- Hold-and-respin: each newly filled tile pulses 1× → 1.18× → 1× over 200 ms with a tinted shadow burst. Currently it's a static scale-in.
- Free-spin retrigger: when retrigger fires, fly the new spin count number from each scatter cell into the free-spin pill in the header (translate from cell center → pill, 320 ms ease-out). Currently it just bumps the number.
- Cluster cascade: between cascade steps, briefly mask the dropping cells with a dotted-line trace under them.
- All of these honor `prefers-reduced-motion: reduce` (already wired site-wide via `.gampo-reduce-motion`).

### Gap 5 — Mobile + tablet refinements (MEDIUM)

`primitives.css` has 27 media queries and a tablet tier (761–1024). Verify these and patch:

- Slot stage at 375×667: the wheel/hold overlay should shrink so it never crops outside the reel frame.
- ChatDock at 320 px width: the tab labels become icon-only when the dock width < 360 px.
- Cases pokedex grid at 480 px: 2 columns instead of 3, and the rarity filter dropdown should compact to a button group.
- Game tools portal popover should anchor to the bottom-right of the viewport at < 480 px (currently anchors to the trigger which clips on small phones).

Run a Playwright smoke if available (`npx playwright test` in CI mode is fine to skip if no config). Otherwise the user smokes manually; document expectations.

### Gap 6 — Per-game polish leftovers (LOW)

Walk every route once and patch quick wins. Reuse existing assets. Sample list (not exhaustive):

- Roulette: pre-spin idle wheel slow rotation (already exists in some other games like `wheel`); copy the pattern.
- Blackjack: hit/stand button labels grow on `< 480 px`; chip slide animation when bet placed.
- Lottery: final settle animation — currently the tumbler stops abruptly. Add a 200 ms damped wobble.
- Tower: tier reveal ladder — light up each row from bottom to current with 60 ms stagger when the player advances.
- ChickenCross: lane fade-in on advance (220 ms ease-out cross-fade between previous and new lane).
- VideoPoker: hold toggle pulse (200 ms scale 1 → 1.06 → 1) when player marks a card.

If you ship more than 3 of these, group them into one wave doc.

### Gap 7 — Documentation update (REQUIRED)

After each wave doc, append a single line to the close-out section of `docs/stake-rainbet-followups-2026-05-25.md` summarizing what shipped. Keep the doc strictly chronological. Do **not** create a new top-level plan doc; this is mop-up, not strategy.

## Deferred (do not touch unless explicitly asked)

- SteamAnalyst price ingestion — token returns 401, code path is in place, leave it.
- 9router image generation — token usage is rationed, the user doesn't want more atlases.
- New SVG glyphs for sidebar / icons — reuse `src/data/sidebarIcons.jsx`.
- Trade-up UI for cases — `useCaseCollection` no longer exposes `tradeUp` (Wave 31 rewrite); user explicitly said no selling/trading.
- Bonus mode `useBgm` — already swaps automatically when `freeSpinSession` is active.
- Chat persona system — already deep enough; do not add more personas.

## Definition of done

- All 7 gaps closed (or ≥5 of them with explicit "deferred" notes for any skipped).
- `npm test -- --run` 125+/26+ green (you may add tests; never reduce coverage).
- `npm run build` clean ≤ 15 s.
- A new `docs/stake-rainbet-wave-<N>-2026-05-25.md` per shipped wave.
- One trailing line in `docs/stake-rainbet-followups-2026-05-25.md` per wave.
- No new image generation, no new sidebar SVG authoring, no new 9router calls.
- ChatDock tab order, locked width, popover portal pattern all preserved.

## Helpful files at a glance

- `src/components/games/cases/CasesGame.jsx` — 600+ LOC, multi-row + pokedex.
- `src/components/games/cases/cases.css` — anchor scale + particle burst styles.
- `src/components/games/slots/SlotsGame.jsx` — 1000+ LOC, contract panel, BGM swap.
- `src/components/games/slots/slotFactory.js` — `applyRankArt` + 20 templates.
- `src/data/slotFeatureContracts.js` — 20 contracts.
- `src/components/games/primitives/GameToolbar.jsx` — portal popover.
- `src/components/games/primitives/WinPathOverlay.jsx` — SVG dotted lines.
- `src/components/games/primitives/VolumeMixer.jsx` — master/BGM/SFX sliders.
- `src/components/Sidebar.jsx` — adaptive Games vs Sports + pins.
- `src/components/ChatDock.jsx` + `ChatDock.css` — locked 400 px, 4 tabs.
- `src/components/AchievementToast.jsx` + `MissionToast.jsx` — auto-dismiss popups.
- `src/hooks/useProgress.js` + `useMissions.js` + `useCaseCollection.js` + `useCsCollection.js` + `useSidebarPins.js` — all listener-pattern.
- `src/context/SocialContext.jsx` — 18-player roster + 6-persona templates.
- `src/audio/audioContext.js` — 3-bus mixer, persisted volumes.
- `src/audio/useSfx.js` + `useBgm.js` — sound playback.
- `src/data/sidebarIcons.jsx` — extracted SVG glyph paths.
- `scripts/genSfx.mjs` — procedural 16-bit WAV generator.
- `scripts/buildCsCollection.mjs` — CS catalog + prices builder.
- `scripts/genSlotRankArt.mjs` + `sliceSlotRankArt.mjs` — atlas tools (already complete; do not rerun).

## Run once before starting

```bash
npm install
npm test -- --run
npm run build
```

Confirm 125/26 green and clean build, then begin with **Gap 1** (sim-player strip primitive). It unblocks the most surface area and is the lowest risk.

## Constraints (one more time)

- No new images. No 9router. No new SVG.
- Don't break ChatDock tab order / locked width.
- Don't re-attempt SteamAnalyst price calls.
- Each wave: write tests, run tests, run build, write close-out, append summary line.
- If you hit a question that materially changes scope, **stop and ask the user**. Otherwise proceed.

End of brief. Begin Gap 1.
