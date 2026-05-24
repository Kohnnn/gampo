# Stake/Rainbet Wave 14 close-out (per-game playfield scroll)

- Captured at: 2026-05-24
- Inputs: user request to enable scrolling inside the game page so games whose
  natural height exceeds the viewport don't get clipped, with the option for
  a different policy per game.
- Reference: Stake/Rainbet pattern keeps the page chrome (header, sidebar)
  fixed and lets the playfield scroll internally on small viewports while
  the rest of the layout stays in place.

## Scope shipped

### 1. Playfield internal scroll

- `.gs-playfield` switched from `overflow: hidden` to
  `overflow-y: auto; overflow-x: hidden`.
- Added `overscroll-behavior: contain` so wheel scrolling inside the playfield
  doesn't bleed into the page-level scroll context.
- Custom scrollbar (6px, white tint at 14%/22%) using `-webkit-scrollbar` and
  `scrollbar-width: thin` for cross-browser consistency.
- Justification flipped from `center` to `flex-start` by default so when the
  game content exceeds the viewport, scroll position starts at the top
  (instead of the middle, which would hide the header and force the user to
  scroll up to find it).

### 2. Per-game scroll opt-in via data attribute

- New CSS rule: `.gs-playfield:has(> [data-playfield-fit="center"]) { justify-content: center }`.
- Games whose content always fits and want classic centered placement can
  add `data-playfield-fit="center"` to their root wrapper.
- Default behaviour (no attribute) is the new "stake-style" scrollable
  start-aligned playfield.
- Both attribute values are forward-compatible; `data-playfield-fit="scroll"`
  is reserved for the same effect as the default and lets future games be
  explicit about their scroll preference.

### 3. Slot stage adapts without cropping

- `.slot-stage-v2` `min-height` changed from `0` (Wave 13 attempt) to a hard
  `560px` so the reels + controls + foot strip always have room.
- `grid-template-rows` middle row changed from `minmax(0, 1fr)` to
  `minmax(280px, 1fr)` so the reel grid never collapses under content
  pressure.
- Stage is no longer `height: 100%` — it sizes to its natural height and the
  playfield scroll handles overflow at small viewports.

### 4. Direct-child width normalization

- `.gs-playfield > *` rule sets `width: 100%; flex: 0 0 auto` so games that
  render multiple direct children (slot stage + EducationPanel on narrow
  viewports, for example) stack cleanly across the playfield width.

## Verification

- `npm test` — 90 / 90 pass.
- `npm run build` — pass.
- Smoke at 1280×700 (small laptop) on `/wanted-revelation`:
  - playfield height: 270px (constrained by viewport - chrome).
  - playfield scrollHeight: 856px → `canScroll: true`.
  - playfield `overflow-y: auto`.
  - slot stage natural height: 828px (no clipping).
  - User can scroll inside the playfield to reach the bottom spin/auto/info
    controls without leaving the page or stretching the layout.
- Smoke at 1440×900 (default desktop) on `/wanted-revelation`:
  - playfield fits the slot stage exactly within the available area.
  - `docScroll === 0`; no page-level scroll appears.

## Files touched

- `src/components/games/primitives/primitives.css` — playfield overflow,
  scrollbar treatment, `data-playfield-fit` opt-in, child width rule.
- `src/components/games/slots/slots.css` — slot stage `min-height: 560px`,
  reel grid floor of 280px so content never collapses.

## Status

Wave 14 — **shipped**.

## Engagement totals (Waves 6 → 14)

- 20 slot templates with unique covers + AI symbol packs.
- Engine: line / ways / megaways / cluster / pay-anywhere with cascade,
  money, mystery, sticky-wild, multiplier zones, multiplier wheel,
  hold-and-respin, buy-tier picker.
- Plinko outcomes lazy-split per row count.
- Game shell fits one viewport across 1100–1920 px and now scrolls
  internally inside the playfield when game content exceeds the available
  height — page-level scroll never appears.
- Per-game opt-in via `data-playfield-fit="center"` for small games that
  want classic centered placement instead of scroll.
- Live poker with persistent info strip, cash-out-early, bot rotation,
  ante-aware aggression, smarter sizing, difficulty mistakes, rebuy modal,
  cash-game format with top-up, animated chip-into-pot motion, time-bank
  ring, short-stack push/fold ICM nudges.
- Big/mega-win cinematic with shockwave + ramp + tier-driven palette and
  falling coins, plus toast stack capped at 3 with same-title dedupe.
- 90 / 90 tests passing.

## Wave 15 candidates (deferred)

- `data-playfield-fit="center"` opt-in applied to games that natively fit
  (CoinFlip, Wheel, Roulette, Hilo, Dice) to preserve their original
  centered playfield aesthetic.
- Sticky bottom action bar variant for the slot controls so the spin button
  stays visible during scroll.
- Animated card flip transitions on flop/turn/river for `/poker`.
- Pure-CSS fallback for the multiplier ramp counter.
- Hand-strength tooltip overlay during showdown.
