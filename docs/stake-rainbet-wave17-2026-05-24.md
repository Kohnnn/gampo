# Stake/Rainbet Wave 17 close-out (titlebar popup + sidebar regroup)

- Captured at: 2026-05-24
- Inputs: user punch list items 1, 2, 6 (titlebar cleanup, odds popup,
  sidebar regroup). Items 3 (slot bonus depth), 4 (CS case opening), 5
  (progression system) are scoped to Waves 18–20 with the brainstorm doc
  at `docs/stake-rainbet-wave17-plan-2026-05-24.md`.

## Scope shipped

### 1. Provably-fair + keyboard help moved to popup

- `GameToolbar` rewritten so the titlebar exposes only:
  - Display group: mute / motion / fullscreen.
  - Single "Game tools" trigger (`Wrench` icon).
- The trigger opens `.gt-popover` with three menu items:
  - Provably fair (opens existing `FairnessDrawer`).
  - Odds & RTP (new `OddsPopup` — Wave 17 item 2).
  - Keyboard shortcuts (opens existing `HotkeyHelp`).
- Popover dismisses on outside click or Escape.
- `HotkeyHelp` updated to accept a `controlledOpen` + `onClose` prop so the
  toolbar popover can drive it; the existing `?` keyboard shortcut still
  works for users who never open the menu.
- Popover uses `z-index: 200` and titlebar lifted to `z-index: 5` so the
  menu floats above `gs-layout` content.

### 2. Odds & RTP popup

- New `OddsPopup` component (`src/components/games/primitives/OddsPopup.jsx`)
  renders RTP, house edge, win chance, EV per play, volatility, and
  20-play bankroll risk — same metrics that used to live inline in the
  EducationPanel — as a dialog launched from the Game tools popover.
- Reads `definition` from `GameShell` (already wired through
  `findGameDefinition`); no extra context plumbing required.
- New CSS for `.odds-popup-backdrop` / `.odds-popup-card` /
  `.odds-popup-grid` plus pos/neg colored EV cells matches the existing
  Stake/Rainbet aesthetic.
- Dismisses on Escape or backdrop click; `overflow: auto` so the card
  fits any viewport.

### 6. Sidebar regroup

- `gameItems` rebuilt with explicit ordering Featured → Originals → Slots
  → Tables → Cards → Arcade.
- Featured (top tier): Live Poker, Crash, Plinko, Mines, Dice, Limbo,
  Keno, Wheel — the Gampo originals tier per user request.
- Originals (extended Gampo arcade originals): Dino, Tower, Chicken Cross,
  Coin Flip, RPS, Guess, Color, Lottery.
- Slots: 21 entries — Slot Factory + 20 templates with their dedicated
  routes (Vault Rush, River Catcher, Dust Rail, Storm Banner, Bassline,
  Scarab Spin, Bars, Blue Samurai, Wanted Revelation, Gates of Ascent,
  Bass Bayou, Mummy Cascade, Phoenix Megaways, Mansion Megaways,
  Ghostblade Strike, Iron Fist, Coop Cluck, Miko Spirit, Forge Anvil,
  Gummy Drops).
- Tables: Roulette, Blackjack, Baccarat, Casino War, Sic Bo (5).
- Cards: Video Poker, Hi-Lo Cards (2).
- Arcade: Cases, Drill, Packs, Tome of Life, Tarot, Flip, Diamonds, Darts,
  Pump, Slide, Moles, Snakes, Collections (13).
- Open-by-default groups: Featured + Slots (was Featured only). Search
  still expands all groups at once when the input has content.

## Verification

- `npm test` — 90 / 90 pass.
- `npm run build` — pass.
- Smoke `/dice` at 1440×900:
  - Sidebar shows the new groups with counts: Featured 8, Originals 8,
    Slots 21, Tables 5, Cards 2, Arcade 13.
  - Titlebar shows Display group + a single Game tools trigger.
  - Game tools popover opens with three menu items + close.
  - Clicking "Odds & RTP" opens the dialog with full metric grid (RTP 99%,
    House edge 1%, Win chance 49.5%, EV -0.05, Volatility Configurable,
    20-play risk 100%) plus the lesson and recent P/L.

## Files touched

- `src/components/games/primitives/GameToolbar.jsx` — rewrite for popover
  trigger + menu, drops the loose buttons.
- `src/components/games/primitives/OddsPopup.jsx` — new component.
- `src/components/games/primitives/HotkeyHelp.jsx` — accept controlled
  open state, drop the always-visible toolbar button.
- `src/components/games/primitives/GameShell.jsx` — pass `definition`
  through to the toolbar so OddsPopup can read it.
- `src/components/games/primitives/primitives.css` — new
  `.gt-popover` / `.gt-popover-item` / `.gt-popover-close` rules,
  `.odds-popup-*` rules, titlebar `z-index: 5` to keep popover above
  content.
- `src/components/Sidebar.jsx` — regrouped `gameItems` and updated default
  open groups to Featured + Slots.

## Documentation

- `docs/stake-rainbet-wave17-plan-2026-05-24.md` — brainstorm + Wave 18+
  scoping doc covering items 3 (bonus depth), 4 (CS cases), 5 (progress).
- `docs/stake-rainbet-wave17-2026-05-24.md` — this close-out.

## Status

Wave 17 — **shipped**. Wave 18 (CS case polish) is queued and will require
asset / sound prefs answered (defaults stated in the plan doc).

## Engagement totals (Waves 6 → 17)

- 20 slot templates, 11 engine primitives, lazy plinko outcomes, full
  responsive scaling 320–1920 px with iOS safe-area + landscape sheet,
  poker depth (cash-game, top-up, rebuy, bot rotation, ICM nudges, card
  flip), big-win cinematic, sticky slot action bar, mobile-tuned poker.
- Wave 17: titlebar popup for game tools, dedicated Odds & RTP popup,
  sidebar regroup with Gampo originals on top.
- 90 / 90 tests passing.

## Wave 18+ candidates (deferred)

- Wave 18: CS case open animation + drop history + collection + sound bus.
- Wave 19: Progression system (achievements, missions, VIP labs, popup
  notifications, Stats / Progress / Chat / Race tabs).
- Wave 20: Slot bonus feature depth per template (animated wheel, hold-and-
  respin board fill, sticky-wild lock cinematics, etc.).

Open questions for Wave 18+ are listed in
`docs/stake-rainbet-wave17-plan-2026-05-24.md`. If any of the proposed
defaults (CS case ~3.5s open with cubic-out, silent SFX manifest, cosmetic
bonus visuals, Race stays separate from Progress, localStorage-only
achievements with reset) don't fit the plan, ping me before Wave 18 starts.
