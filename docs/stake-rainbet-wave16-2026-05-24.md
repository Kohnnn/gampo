# Stake/Rainbet Wave 16 close-out (mobile polish + poker flips)

- Captured at: 2026-05-24
- Inputs: Wave 15 close-out follow-ups (iOS safe-area, touch hit-targets,
  landscape sheet, sticky action bar, poker card flip).

## Scope shipped

### 1. iOS safe-area inset support

- `index.html` viewport meta updated to
  `width=device-width, initial-scale=1.0, viewport-fit=cover` and a
  `theme-color` meta added so iOS browsers extend behind the home-indicator
  bar.
- `.game-shell` gets `padding-bottom: max(12px, env(safe-area-inset-bottom))`
  inside an `@supports (padding: env(safe-area-inset-bottom))` guard so older
  browsers stay untouched.
- `.gs-playfield` gets `scroll-padding-bottom: env(safe-area-inset-bottom)`
  so when the user scrolls to the bottom of a playfield, content is not
  clipped behind the home indicator.

### 2. Touch hit targets ≥ 44 px

- New `@media (pointer: coarse)` block enforces minimum touch sizes:
  - `.slot-pill`, `.slot-feature-switches button`, `.pk-act`, `.pk-info-cell`,
    `.pk-info-cashout`, `.pk-info-topup` all `min-height: 44px`.
  - Compact stepper buttons (`.slot-mini-btn`, bet steppers, quick-toggle
    buttons, `.gt-btn`) all bumped to `min-width: 36px; min-height: 36px`.
  - Raise presets `min-height: 36px` with `padding: 8px 12px` for a tap-safe
    surface.
- Targets only apply to coarse pointers, so desktop layout density stays the
  same.

### 3. Landscape phone slide-up sheet

- New `@media (max-height: 520px) and (orientation: landscape)` block:
  - `.gs-layout` switches to a single column with `1fr auto` rows.
  - `.gs-panel` becomes a fixed bottom sheet via
    `position: fixed; left/right: 0; bottom: 0; max-height: 56vh;
    transform: translateY(calc(100% - 48px));` so only a 48 px handle is
    visible at rest.
  - On `:hover` or `:focus-within`, `transform: translateY(0)` slides the
    full bet panel up — keyboard and touch users both reach it.
  - `gs-panel::before` renders a `BET` label at the top of the handle so the
    sheet is discoverable.
  - `.gs-aside` is hidden in landscape phone since vertical space is at a
    premium; stats remain accessible via the chat / activity drawer.
  - `.gs-titlebar` shrinks to `padding: 6px 10px` and the toolbar extras row
    is hidden on landscape phones.

### 4. Sticky bottom action bar (slot)

- `.slot-controls-v2` becomes `position: sticky; bottom: 0; z-index: 5` on
  viewports ≤ 760 px so the spin button stays anchored as the user scrolls
  through reels, header pills, and feature overlays.
- Backdrop blur (`backdrop-filter: blur(10px)`) plus a translucent gradient
  background keeps the controls readable over busy stage backdrops.
- `padding-bottom: max(8px, env(safe-area-inset-bottom))` so on iOS the
  controls clear the home-indicator bar.

### 5. Poker card flip transitions

- `pkCardDeal` keyframe rewritten as a 4-stop sequence:
  - `0%`: card flies in from `translateY(-60px)` with `rotate(-180deg)`,
    `scale(0.6)`, transparent and a brightness boost.
  - `50%`: settles at `rotate(-90deg)` (perpendicular flip mid-point).
  - `80%`: tiny `rotate(-8deg) scale(1.04)` overshoot for snap.
  - `100%`: rests at the natural face-up position.
- Animation duration extended from 0.4 s → 0.55 s to make the flip readable.
- The animation is now bound to
  `.pk-card:not(.empty):not(.hidden)` so face-up community cards and showdown
  reveals get the flip while empty placeholders and hidden hole cards stay
  static.
- Reduced-motion media query disables the new animation.

## Verification

- `npm test` — 90 / 90 tests pass.
- `npm run build` — pass.

## Files touched

- `index.html` — viewport-fit=cover, theme-color meta.
- `src/components/games/primitives/primitives.css` — safe-area inset block,
  touch hit-target media query, landscape phone slide-up sheet rules.
- `src/components/games/slots/slots.css` — sticky bottom slot controls on
  ≤ 760 px with safe-area padding.
- `src/components/PokerGame/PokerGame.css` — richer 4-stop pkCardDeal flip,
  scoped to face-up cards, with reduced-motion guard.

## Status

Wave 16 — **shipped**.

## Engagement totals (Waves 6 → 16)

- 20 slot templates with unique covers + AI symbol packs.
- 11 engine evaluation/feature primitives.
- Plinko outcomes lazy-split per row count.
- Game shell fits one viewport across 320–1920 px.
- Per-game scroll policy via `data-playfield-fit` attribute.
- Live poker depth (info strip, cash-out, bot rotation, ante aggression,
  smarter sizing, difficulty mistakes, rebuy, cash-game + top-up, chip
  motion, time-bank ring, push/fold ICM).
- Big/mega-win cinematic with shockwave + ramp + tier palette + falling
  coins, scales fluidly with viewport.
- Toast stack capped at 3 with same-title dedupe.
- Mobile-ready titlebar, slot stage, and poker felt holding up at 360 px
  viewport.
- Wave 16: iOS safe-area, ≥44 px touch hit targets, landscape phone slide-up
  bet sheet, sticky slot action bar, poker card flip transitions.
- 90 / 90 tests passing.

## Wave 17 candidates (deferred)

- Tablet-specific tuning (768 × 1024) so the bet panel can stay docked on
  iPad-class viewports without forcing single-column.
- Hand-strength tooltip overlay during showdown.
- Pure-CSS fallback for the big-win multiplier ramp counter.
- Custom rebuy amount in info strip.
- Reload top-up mid-round when stack is short of required call.
- Time-bank tick sound cue.
