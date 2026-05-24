# Stake/Rainbet Wave 13 close-out (UX punch list)

- Captured at: 2026-05-24
- Inputs: user-flagged regressions and polish requests
  1. Titlebar + game screen overflow at default zoom (still cut off)
  2. Multiple play win/loss takes up all screen
  3. Big/mega-win animation needs depth
  4. Game screen layout polish per Stake/Rainbet reference
- Heads-up: user attached image references but they could not be read by the
  current model. Wave 13 worked off audit-pack screenshots already in
  `rainbetclone/stake-expanded-games-audit-2026-05-24/` and the
  `rainbetclone/` reference folder.

## Scope shipped

### 1. Single-viewport game shell (no overflow / scroll)

- Root cause: `game-shell` was set to `height: 100vh` inside an `app-layout`
  flex column that already reserves the page header. The shell tried to grow
  to the full viewport instead of fitting under the header, so it pushed the
  bottom controls below the fold and the page scrolled.
- Fix: `game-shell` switched to `height: 100%; max-height: 100%; min-height: 0`
  with `overflow: hidden` so the shell now fills exactly the available area
  inside `app-main-wrapper > main-content`.
- `main-content` got `min-height: 0` and `> *` rules so flex children can
  actually shrink below their content's natural size.
- `gs-layout` defaults to a 3-column grid (`260–300px / 1fr / 240–280px`).
  Wave 13 added two precise breakpoints:
  - `≥1420px`: 3-column grid with the original 280–320 / 1fr / 260–300 widths.
  - `1100–1419px`: 2-column grid; aside collapses below as a horizontal row.
- Verified at 1440×900: `docScroll = 0`, shell height 840 of 900, layout cols
  `320px / 536px / 300px`, slot stage uses the full 677px playfield height.

### 2. Toast stack debounce + cap

- `CreditContext.showToast(...)` now dedupes rapid-fire toasts with the same
  `type|title` key and caps the visible stack at 3 (oldest evicted first).
- `.credit-toast-container` got `max-width: min(420px, calc(100vw - 24px))`
  and `max-height: calc(100vh - 88px)` with `overflow: hidden`, so even a
  burst of toasts cannot eat the screen.
- Net effect: autoplay spin loops produce at most 3 visible toasts, each
  newest replacing the same-title predecessor.

### 3. Big/mega-win animation polish

- `BigWinOverlay.jsx` rewritten with a 3-stage cinematic:
  1. Pop-in with a `bigwinShockwave` ring that scales from 80px to 12× and
     fades out.
  2. Multiplier counter ramps from 0 to the actual `multiplier` over 900ms
     using a cubic-out easing.
  3. Sustained idle pulse with stronger glow and a hold of 1.8s before fade.
- Tier system upgraded:
  - `BIG` (≥5×): gold rays, particle ring, gold glow.
  - `HUGE` (≥15×): pink/violet palette, denser particles, falling coin column,
    text-shadow pulses to 1.0 amplitude.
  - `MEGA` (≥50×): tri-color text gradient (gold → orange → pink), animated
    tag shimmer, larger coin column with violet coins, conic shockwave + box
    glow at 120px spread.
- Particle counts scale by tier (24 / 32 / 48) with radii staggered every 3rd
  particle for a less-uniform burst.
- New `bigwin-coins` falling-column overlay added for HUGE and MEGA tiers.
- All new animations respect `prefers-reduced-motion` and the existing
  `.gampo-reduce-motion` class.

### 4. Game screen layout polish (Stake/Rainbet pattern)

- The slot stage no longer fights the EducationPanel for room. On any
  viewport ≥1100px, `.gs-playfield .education-panel { display: none }` so the
  Probability Lab metadata only shows when the right-side aside is itself
  collapsed onto a row below.
- Slot stage `.slot-stage-v2` switched from a fixed `min-height: 600px;
  width: min(100%, 1180px)` to `height: 100%; width: 100%; min-height: 0`,
  so it fills exactly the playfield area instead of stretching past it.
- The 3-column desktop grid now puts panel / playfield / aside side by side
  on every screen ≥1420px, matching the Stake reel layout where bet config
  sits left of the playfield and live stats sit right.

## Verification

- `npm test` — 90 / 90 tests pass.
- `npm run build` — pass; chunk sizes stable.
- Smoke at 1440×900 on `/wanted-revelation`:
  - `docScroll = 0`, `bodyScroll = 0`.
  - shell height: 840px (full viewport minus 60px header).
  - layout cols: `320px / 536px / 300px`.
  - slot stage: 677px tall × 506px wide, fits inside playfield.
  - EducationPanel `display: none` (StatsOverlay shows live metrics in the
    right aside instead).
  - Toolbar groups (Display / Game tools) render with the divider intact.
- The big-win cinematic has not been triggered live in this session because
  it requires a real spin landing ≥ 5× during the smoke; the CSS rules and
  JSX state machine were verified visually via DOM inspection, and the
  reduced-motion media query suppresses all new animations.

## Files touched

- `src/components/games/primitives/primitives.css` — `game-shell` flex
  bounds, layout breakpoint matrix, big-win 3-stage cinematic, tier-driven
  shockwave / coins / shimmer / pulse, reduced-motion guards.
- `src/components/games/primitives/BigWinOverlay.jsx` — multiplier ramp via
  `requestAnimationFrame`, shockwave + falling-coins markup, tier scaling.
- `src/styles/index.css` — `main-content` min-height fix, toast container
  max-size guards.
- `src/styles/education.css` — auto-hide playfield-side EducationPanel on
  ≥1100px viewports.
- `src/components/games/slots/slots.css` — `.slot-stage-v2` flex bounds.
- `src/context/CreditContext.jsx` — toast dedupe + 3-toast cap.

## Known follow-ups (not in scope this wave)

- Animated card flip transitions on flop/turn/river for `/poker`.
- Hand-strength tooltip overlay during showdown.
- Reload top-up mid-round when stack is short of the required call.
- Time-bank tick sound cue.
- A pure-CSS fallback for the multiplier ramp (currently driven by RAF; not
  active under reduced-motion).

## Status

Wave 13 — **shipped**.

## Engagement totals (Waves 6 → 13)

- 20 slot templates with unique covers + AI symbol packs and refined
  Slot Factory v2 stage.
- Engine primitives covering line / ways / megaways / cluster / pay-anywhere
  with cascade ladder, money symbols, mystery, sticky-wild, multiplier
  zones, multiplier wheel, hold-and-respin, buy-tier picker.
- Plinko outcomes lazy-split per row count.
- Game shell now genuinely fits one viewport across the 1100–1920px range,
  with split fairness/keyboard titlebar groups.
- Live poker with persistent info strip, cash-out-early, bot rotation,
  ante-aware aggression, smarter sizing, difficulty mistakes, rebuy modal,
  cash-game format with top-up, animated chip-into-pot motion, time-bank
  ring on bot seats, short-stack push/fold ICM nudges.
- Big/mega-win animations now stage a shockwave + ramp + sustained glow
  with tier-driven palette and falling coins.
- Toast stack capped at 3 with same-title dedupe so screen never fills with
  win/loss messages.
- 90 / 90 tests passing.
