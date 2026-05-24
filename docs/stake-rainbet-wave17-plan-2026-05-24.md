# Wave 17+ master plan and brainstorm

- Captured at: 2026-05-24
- Source: user punch list (six items)
- Mode: build

## Punch list

1. Move provably-fair + keyboard help out of the in-game titlebar; keep them
   on the page but as standalone popup buttons (not inside the toolbar).
2. Move probability/RTP/odds info bundle to a popup button alongside fairness.
3. Improve bonus feature for all slots so each template has a deeper, more
   interactive bonus loop.
4. Improve the CS case opening: add open animation, sound, collection grid,
   provenance + drop history. Should feel like a real CS case.
5. Improve single-player progression: achievements (with reset), polished
   promotions / missions / VIP labs, popup notifications on completion,
   multi-tier progress system. Add a `Progress` tab in the chat popup so
   tabs become Stats / Progress / Chat / Race.
6. Re-categorize the left sidebar: keep Gampo originals on top; surface
   more games per category.

## Wave-level execution plan

- **Wave 17** (this ship)
  - Item 1: extract fairness + keyboard help into a docked
    "Game tools" popup button cluster outside the titlebar.
  - Item 2: new Odds popup with RTP / house edge / EV / bankroll risk per
    game; uses existing `EducationPanel` math.
  - Item 6: sidebar regroup — Gampo Originals tier on top, then Slots,
    Tables, Cards, Arcade, Originals (legacy), Sports.
  - Build/tests + close-out.

- **Wave 18**
  - Item 4: CS case opening polish — full reel-pick animation with rolling
    items, click-to-stop, drop history, collection grid, sound bus, provenance
    badges.
  - Build/tests + close-out.

- **Wave 19**
  - Item 5: progression system. New `useProgress` hook + achievements
    catalog. `Progress` tab in chat popup (Stats / Progress / Chat / Race).
    Promotions / Missions / VIP Lab pages re-skinned.
  - Achievement-completed popup that mirrors the toast pattern but louder.
  - Build/tests + close-out.

- **Wave 20**
  - Item 3: deeper bonus features per slot template.
    - Wanted Revelation: animated wanted-poster reveal + sticky upgrade ladder.
    - Gates of Ascent: persistent multiplier ramp visualization.
    - Bass Bayou: animated angler character that walks across reels and
      collects money symbols on each free spin.
    - Mummy Cascade: cascade chain meter that powers a flame-up at higher
      multiplier ladder steps.
    - Phoenix Megaways: row-randomization per spin animation.
    - Mansion Megaways: persistent multiplier widget with growth pulse.
    - Iron Fist: real multiplier wheel cinematic with weighted segments.
    - Ghostblade Strike: 3x zone column highlight band + boost feedback.
    - Coop Cluck: chick collect to bonus barn cinematic.
    - Miko Spirit: lantern collect + sticky-wild lock visualization.
    - Forge Anvil: hold-and-respin coin board with per-step coin fill.
    - Gummy Drops: cascading multiplier orb with growth animation.
  - Build/tests + close-out.

## Open questions before deeper waves

To stage these efficiently I need answers on:

1. Achievements scope — do you want fully wired achievements with persistence
   across reload (local storage only), or remote-syncable via the existing
   `useGlobalPnl` hook? Default: localStorage only, with a "Reset progress"
   button.
2. Progress tab content — should Race stay as its own tab or fold into
   Progress? Default keeps it separate (Stats / Progress / Chat / Race).
3. CS case open animation — short (~2s scroll-through) or long (~6s with
   slowdown / suspense)? Default: ~3.5s with cubic-out deceleration.
4. CS case sound — re-use existing `useSfx('cases')` channel and ship silent
   manifest entries, or generate / source new SFX clips? Default: silent
   manifest (matches the rest of the project; you can add binaries later).
5. Bonus feature math impact — should the new visual bonuses also change
   underlying RTP, or stay purely cosmetic? Default: cosmetic only — math
   stays deterministic per existing engine contract.
6. Sidebar regroup — should "Originals" mean the AI-generated Gampo originals
   (Crash / Plinko / Mines / Dice) or the broader arcade set? Default:
   keep `Featured` on top with the Gampo originals (Crash / Plinko / Mines /
   Dice / Limbo / Keno), then alphabetical Slots / Tables / Cards / Arcade.

If any of these defaults don't match what you want, ping me before Wave 18.

## Wave 17 — detail

### 1. Fairness + keyboard help relocated

- Rewire `GameToolbar` so it only renders Display group (mute / motion /
  fullscreen) and a single "Game tools" trigger that opens a small popover.
- The popover renders fairness, keyboard help, and (Wave 17) odds buttons.
- Existing `FairnessDrawer` and `HotkeyHelp` components keep their
  open-state APIs; new popover dispatches to them.
- Mobile: popover slides up as a sheet at the bottom.

### 2. Odds popup

- New `OddsPopup` component reads `definition` (rtp/houseEdge/winChance/
  volatility) and the latest spin result to render a compact odds card.
- Reuses the math helpers in `simulationMath.js` (no new logic).
- Mounted from the new "Game tools" popover so it lives next to fairness.

### 3. Sidebar regroup

- New `gameItems` order: `Featured` → `Slots` → `Tables` → `Cards` →
  `Arcade` → `Originals (legacy)`.
- "Slots" group lists all 20 templates by route.
- "Tables" includes Roulette, Blackjack, Baccarat, Casino War, Sic Bo.
- "Cards" includes Video Poker, Hi-Lo, Hi-Lo Cards.
- "Arcade" keeps Color/Tower/ChickenCross/Lottery/Slots/CoinFlip/RPS/Guess.
- Default open groups: Featured + Slots.
