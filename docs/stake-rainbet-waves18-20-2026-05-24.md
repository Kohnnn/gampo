# Stake/Rainbet Waves 18–20 Close-out — 2026-05-24

Three back-to-back wave drops shipped after Wave 17:

- **Wave 18** — CS case opening polish (drop history, collection grid, deceleration animation, SFX hooks).
- **Wave 19** — Progression system (`useProgress` hook, achievements catalog, Progress tab, achievement toast).
- **Wave 20** — Slot bonus feature depth, cosmetic-only per-template cinematics on top of the existing math contract.

All defaults proposed in the brainstorm shipped unchanged. No engine math
or RTP changed.

## Wave 18 — Cases polish

### What shipped
- New `useCaseCollection` hook persists drop history (last 200 entries, newest-first) and an owned-skin map keyed by skin id. Listener pattern matches `useGlobalPnl` / `useProgress` so any consumer sees the same numbers without a Provider tree.
- Case carousel reveal extended from ~4.5s to **3.5s with a stronger cubic-out** (`cubic-bezier(0.16, 0.92, 0.28, 1)`), 32 visible tiles, prize at index `len-4`, and a small `±7px` jitter so consecutive opens don't look identical.
- SFX manifest extended for cases with declared roles: `open`, `tick`, `land`, `rare`, `reveal`, `win`, `lose`, `click`. Manifest still ships **silent** — the user adds binaries later. Tick volume softens across the deceleration; `rare` chimes only when a Covert/Extraordinary lands.
- Stage now has three tabs: **Open / History / Collection**.
  - History list shows skin thumbnail, rarity, source case, multiplier, relative timestamp.
  - Collection grid shows owned skins sorted by best multiplier with rarity-tinted borders + count badge.
  - Both have a "Reset" button (history reset wipes both stores).
- Bet panel surfaces collection summary pills inline: total drops, unique skins, best multiplier.
- Carousel pointer redrawn with top/bottom triangles and an accent glow.
- Result cards animate in with a pop + a 1.6s rare glow when Covert+ rarity.

### Files added
- `src/hooks/useCaseCollection.js`
- `src/hooks/useCaseCollection.test.js`

### Files modified
- `src/components/games/cases/CasesGame.jsx` — full rewrite around the new hook + view tabs.
- `src/components/games/cases/cases.css` — view tabs, history list, collection grid, polished pointer/result cards.
- `src/audio/sfxManifest.js` — extended `cases` block with declared roles.

### Tests
- 4 new tests in `useCaseCollection.test.js`:
  - Records a drop and bumps the count.
  - Caps history at 200 entries.
  - Keeps the best multiplier per skin across multiple drops.
  - Reset clears history + collection.

## Wave 19 — Progression system

### What shipped
- New `src/data/achievements.js` catalog with **20 achievements across 6 groups**: Activity, Wins, Streaks, Features, Cases, Volume. Each achievement carries `id`, `group`, `tier` (bronze/silver/gold/platinum), `name`, lesson `detail`, lucide `icon`, `target`, and `evaluate(stats) => number`.
- New `useProgress` hook (`src/hooks/useProgress.js`) tracks:
  - Per-round stats: total rounds, wins/losses/pushes, wagered, profit, best multiplier, current/best win streak, unique games, last game id.
  - Case-specific stats: total drops + rare-rarity drops.
  - Unlocked map persisted to `gampo_progress_unlocked`.
  - Most-recent unlock surfaces as `recentUnlock` for the toast.
  - Reset wipes both stats and unlocks.
- `useGameSession.record` now mirrors every settled round to `recordRound` so every game on the site contributes to the progression system without per-game changes.
- Cases also call `recordCaseDrop(pick)` so cases-rare / cases-50 unlock independently.
- New **Progress tab** in ChatDock (between Stats and the existing tabs):
  - Conic-gradient progress ring with unlock percent and `unlocked/total` label.
  - 4-stat summary grid: rounds, wins, best ×, best streak.
  - Recent-unlocks list (last 6 with relative timestamps).
  - Grouped achievement list with per-row icon, name, lesson, animated progress bar, and a tier-tinted border. Completed entries flip to a check + accent fill.
  - "Reset progress" button with a 2-step confirm.
- New `AchievementToast` component mounted in `Layout`. Auto-dismisses after 5.2s, click-to-dismiss, tier-tinted glow, animated countdown bar.
- Sidebar Row 3 gains a **Progress** action that opens ChatDock on the Progress tab via the existing `gampo:open-chat` event.
- ChatDock width adapts to `w-progress` (420px wide, 82vh tall) for the new tab.

### Files added
- `src/data/achievements.js`
- `src/hooks/useProgress.js`
- `src/hooks/useProgress.test.js`
- `src/components/ProgressPanel.jsx`
- `src/components/AchievementToast.jsx`
- `src/components/AchievementToast.css`

### Files modified
- `src/components/games/primitives/useGameSession.js` — mirrors round records to `recordRound`.
- `src/components/games/cases/CasesGame.jsx` — also calls `recordProgressCaseDrop`.
- `src/components/ChatDock.jsx` — new Progress tab with `Award` icon, expanded `VALID_TABS` set.
- `src/components/ChatDock.css` — `w-progress` width, full progression panel styles.
- `src/components/Layout.jsx` — mounts `<AchievementToast />`.
- `src/components/Sidebar.jsx` — `progress` action + matching SVG icon.

### Tests
- 6 new tests in `useProgress.test.js`:
  - Records rounds and bumps win/loss/wagered totals.
  - Tracks the best win streak across mixed sequences.
  - Unlocks `first-spin` and `first-win` after one positive round.
  - Counts case drops; flags `Covert`/`Extraordinary` separately.
  - Reset clears stats + unlocks.
  - Hook reference is exported.

## Wave 20 — Slot bonus depth (cosmetic only)

### What shipped
Math is unchanged; the existing `slotFactory.resolveSlotSpin` contract is
respected. These are pure cosmetic enhancements layered on top of the
existing wheel / hold / mystery / cascade events.

- **Sticky-wild lock** — cells in the `stickyWilds` array now render a
  `★` badge in the corner + an accent inset border that pulses 2s
  in/out. Sticky positions accumulate across a free-spin session for
  templates that opt in via `features.stickyWild` or
  `features.stackedWildReel.sticky` (e.g. Miko Spirit Lanterns).
- **Wanted-poster reveal** — when `slot id === 'wanted-revelation'`, the
  mystery overlay swaps to a tan parchment poster with a `WANTED` block
  serif eyebrow, italic name in the middle, and a `REVEALED` footer.
  Slams in with a -12° → 2.4° → -1.4° rotation animation.
- **Multiplier wheel disc** — the wheel overlay grows a 138px conic
  segment disc with a fixed pointer at the top. Disc spins three full
  turns (1080°) while the awarded value fades in on top.
- **Hold-and-respin board fill** — the coin board slots now stagger
  their `filled` state in 60ms increments (`slotHoldFill` keyframes,
  scale 0.4 → 1.1 → 1) so the board fills cell-by-cell rather than
  appearing complete.
- **Bayou money-collect ribbon** — when the active template is the
  bayou skin and the spin's `moneyTotal > 0`, a green ribbon overlay
  pops up with `+{credits} · {symbol count} prize symbols`.
- **Cascade chain ribbon** — when `cascadeSteps >= 2`, a small
  right-aligned ribbon shows `×N tumbles paid` so cascade combos read
  on screen.
- All new animations honored under `prefers-reduced-motion: reduce`
  and the `gampo-reduce-motion` class.

### Files modified
- `src/components/games/slots/SlotsGame.jsx` — sticky cell flag, wanted-poster
  branch in mystery overlay, wheel-disc markup, hold board stagger delay,
  collect + cascade overlays.
- `src/components/games/slots/slots.css` — Wave 20 cosmetics block at the
  end of the file (~165 new lines), reduced-motion guards.

## Verification

- `npm test` → **117 tests across 25 files**, all green (was 98/22 before
  these waves; +19 tests across `useCaseCollection`, `useProgress`, and
  the post-audit unique-games regression test).
- `npm run build` → clean, ~13s. Main entry **123.9 KB / 35.8 KB gzip**.
  SlotsGame chunk **57.1 KB / 15.8 KB gzip**, CasesGame **12.7 KB / 4.7 KB
  gzip**. PlinkoEngine outcome tables still ~2 MB per row count, only loaded
  on `/plinko`.
- Browser smoke deferred — Playwright session locked by another opencode
  instance. Manual sanity check recommended via the user's browser at
  `/cases` (animation feel + history/collection tabs), the chat dock
  Progress tab, and any slot route that hits the wheel/hold/wanted/bayou
  cosmetics (`/iron-fist`, `/forge-anvil`, `/wanted-revelation`,
  `/bass-bayou`, `/miko-spirit`, `/gummy-drops`).

## Post-audit fixes

After the initial Wave 18–20 ship, two issues surfaced during audit:

1. **`uniqueGames` evaluator returned the array, not its length.**
   `evaluate: stats => stats.uniqueGames` made `games-3` / `games-10` /
   `games-25` compare an array against the numeric target, so they
   never unlocked. Fix: each evaluator now returns `stats.uniqueGames.length`.
   Added a new test (`unlocks the games-3 achievement after rounds across
   3 games`) to lock the contract — total 117 tests now.
2. **Sidebar action label collision.** The Row 3 quick-action labeled
   "Progress" duplicated the existing "Progress" sidebar section header,
   making screen-reader output ambiguous. Renamed the action label to
   **"Achievements"**; it still opens the ChatDock Progress tab via the
   `gampo:open-chat` event.

## Notable behavior

- Achievement toast auto-clears in 5.2s (`AUTO_DISMISS_MS`), so quick
  successive unlocks may overwrite the previous toast — current
  behavior matches the user's defaults proposal (single toast slot).
- Resetting progress also clears the recent-unlock list and unlock map
  but does not retroactively re-evaluate older achievements; future
  rounds will re-unlock as targets are crossed.
- Cases history is capped at 200 entries; older drops are dropped from
  history but the cumulative collection counts persist.
- ChatDock now widens to 420px on the Progress tab; mobile (<= 760px)
  forces full-viewport-minus-16px regardless.
- Sticky wild badge uses a CSS `★` glyph; no asset additions.
- All new animations respect `prefers-reduced-motion: reduce` and the
  global `.gampo-reduce-motion` class.
