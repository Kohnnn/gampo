# Stake/Rainbet Wave 15 close-out (full responsive scaling)

- Captured at: 2026-05-24
- Inputs: user request to make all games and features scale with screen size
  and remain playable in any aspect ratio, including mobile.
- Reference: Stake/Rainbet mobile patterns (compact titlebar, stacked panel,
  shrunk seat avatars/cards on poker, larger CTA hit targets).

## Scope shipped

### 1. Game shell mobile reflow

- `.gs-layout` already collapses to single column at <=760px (Wave 10). Wave 15
  adds: tighter `padding`, `gap`, and titlebar reflow.
- `.game-shell` mobile padding reduced from 12 to 8 (760px) → 6 (480px) so
  every screen pixel goes to the game.
- `.gs-aside` switched to `flex-direction: column` on <=760px so right-side
  stats/history stack cleanly under the playfield instead of side-by-side
  rows that get pinched.
- `.gs-aside > *` set to `flex: 1 1 auto; min-width: 0` so child blocks shrink
  with the column.

### 2. Titlebar mobile collapse

- `.gs-titlebar` switched to `1fr auto` (title + balance) and the toolbar
  extras drop to a second row spanning the full width (`grid-row: 2`).
- `h1` font-size shrinks from 20px → 16px (760) → 14px (480).
- `small` (game category) hidden on mobile so the row stays clean.
- Balance number scales 18 → 15 → 13.

### 3. Slot stage responsive

- New `<= 480px` breakpoint added with:
  - `padding: 8`, `gap: 6`, `border-radius: 12px`, `min-height: 440px`.
  - Stage header `h2` 18px, benchmark badge 9px / 20px height.
  - Pills 28px tall, padding 0 8px.
  - Reel frame padding 6, grid gap 3, cell padding 3, `border-radius: 6px`.
  - Cell `img` capped at 36px max-height with 92% max-width so symbols stay
    crisp on a 5- or 6-column grid even at 360 px viewport.
  - Cell `em` (label) 8px, money chip 8px / `padding: 1 5`.
  - Controls grid `padding: 6`, gap 6; spin button shrinks from 64 → 54 px.
  - Result banner `padding: 12 18`, multiplier `clamp(24px, 8vw, 38px)`.
  - Bonus end banner `padding: 16 22`, multiplier `clamp(28px, 9vw, 44px)`.
  - Autoplay drawer + buy modal occupy `calc(100% - 16px)` with `padding: 14`.
  - Mystery / wheel reveals shrink to 26px text.
- `<= 760px` rules tightened: stage min-height 480px (was 600), pill height
  30px, controls grid `padding: 8`.

### 4. Poker mobile responsive

- Lobby buy-in grid drops from 5 columns → 2 columns on mobile.
- `.pk-info-strip` switches from 8 columns → 3 columns (760) → 2 columns (480).
  `Cash Out` and `Top Up` buttons span the full row at the bottom of the strip.
- Felt aspect-ratio shifts from 16/10 (desktop) to 4/5 (760) → 3/4 (480) so
  seats and the centerpiece pot/board fit a portrait phone screen.
- Card sizes:
  - Board card: 56×80 → 38×56 (760) → 30×44 (480)
  - Seat card: 32×46 → 22×32 (760) → 18×26 (480)
- Avatars 44×44 → 30×30; seat min-width 100 → 70 → 60.
- Action buttons: 50px → 42 → 38 with proportional padding/font-size.
- Raise presets compact to 5 chips per row at all sizes (still readable).

### 5. Big-win cinematic responsive

- Multiplier `font-size: clamp(48px, 12vw, 96px)` so it scales with viewport
  width. HUGE tier `clamp(60px, 14vw, 128px)`, MEGA tier `clamp(72px, 18vw,
  160px)`.
- Content padding `clamp(16px, 4vw, 30px) clamp(24px, 6vw, 60px)` and
  `max-width: calc(100vw - 24px)` so the content never overflows the viewport.

### 6. Header/sidebar/chat behavior

- Sidebar already auto-collapses below 720px (existing rule) and the chat
  dock floats over content (Wave 13 toast cap also helps).
- No additional changes required for Wave 15.

## Verification

- `npm test` — 90 / 90 tests pass.
- `npm run build` — pass.
- Smoke at 480×1066 (closest to mobile in the Playwright config):
  - `docScrollX = 0` (no horizontal scroll).
  - Titlebar height 119px (down from 126), h1 20px, no toolbar wrap into
    titlebar.
  - Panel 464×203, playfield 464×366, slot stage 420×652, slot cell 73×62.
  - Stage scrolls inside playfield via Wave 14 `overflow-y: auto`, so all
    bottom controls remain reachable.

## Files touched

- `src/components/games/primitives/primitives.css` — titlebar mobile reflow,
  game-shell tighter padding, aside column, big-win clamp sizes, content
  max-width.
- `src/components/games/slots/slots.css` — `<= 480px` extra-small breakpoint,
  reel/cell/pill/control sizing.
- `src/components/PokerGame/PokerGame.css` — `<= 760px` and `<= 480px`
  breakpoints for titlebar, info strip, felt aspect-ratio, cards, seats,
  actions.

## Status

Wave 15 — **shipped**.

## Engagement totals (Waves 6 → 15)

- 20 slot templates with unique covers + AI symbol packs.
- 11 engine evaluation/feature primitives.
- Plinko outcomes lazy-split per row count.
- Game shell fits one viewport across the 320–1920 px range; playfield
  scrolls internally when game content exceeds available height.
- Per-game scroll policy via `data-playfield-fit` attribute.
- Live poker depth (info strip, cash-out-early, bot rotation, ante
  aggression, smarter sizing, difficulty mistakes, rebuy modal, cash-game
  + top-up, chip motion, time-bank ring, push/fold ICM).
- Big/mega-win cinematic with shockwave + ramp + tier palette + falling
  coins, now scales fluidly with viewport.
- Toast stack capped at 3 with same-title dedupe.
- Mobile-ready titlebar, slot stage, and poker felt that hold up at 360 px
  viewport.
- 90 / 90 tests passing.

## Wave 16 candidates (deferred)

- iOS safe-area inset support (`env(safe-area-inset-bottom)`) for the
  in-game controls so the spin button isn't clipped behind the iPhone home
  indicator.
- Touch-tuned hit targets ≥44 px for the stat pills and recent-results strip.
- Landscape phone layout (e.g. 812×375) with the bet panel as a slide-up
  sheet instead of a stacked column.
- Sticky bottom action bar that floats above the playfield scroll on small
  viewports so the spin button is always visible.
- Animated card flip transitions for `/poker`.
