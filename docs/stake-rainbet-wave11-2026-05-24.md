# Stake Slot Factory — Wave 11 close-out (live poker overhaul)

- Captured at: 2026-05-24
- Inputs:
  - User punch list carryover from Wave 10 (live poker improvements)
  - Existing No-Limit Hold'em engine, GTO panel, hand-history tab, and HeuristicBot
  - Stake/Rainbet poker reference: persistent table info strip, seat metadata,
    side panels, cash-out-early action.

## Scope shipped

### 1. Persistent info strip (hand / level / blinds / ante / pot / stack / P&L / cashout)

- New `<div class="pk-info-strip">` mounted between the title bar and the felt.
- Seven info cells: Hand `n/limit`, Level, Blinds, Ante, Pot, Your stack,
  Session P/L (color-coded), plus a dedicated **Cash Out** button on the right.
- The legacy `pk-sng-status` band that lived inside the felt is hidden, freeing
  up the playfield for cards and seat chips.
- Pot is mirrored on both the strip and the felt for at-a-glance reads.
- Mobile responsive: at <1100px the strip collapses to 4 columns and the
  Cash Out button spans the full width.

### 2. Cash-out-early button always available

- Cash Out is mounted in the info strip during every street, not just at
  showdown.
- Clicking mid-hand opens a confirm dialog (`.pk-cashout-confirm`) explaining
  that the user forfeits chips already in the pot. Confirm leaves the table
  with the remaining stack credited to balance.
- Showdown view still shows a Cash Out button beside Next Hand for users who
  want to leave between hands without confirmation.

### 3. Bot rotation: $0 stack replaced with fresh persona buy-in

- New `rotateBustedBots(prev)` runs at the start of `nextHand`. Any non-human
  seat with stack 0 is replaced with a freshly sampled persona (different
  name, possibly different difficulty), buys in at `initialBuyInRef.current`,
  and rejoins the deal.
- New `pk-rotation-log` strip shows the most recent rotation: `Hand X: name1,
  name2 bought in`.
- Persona pool expanded from 10 to 15 personas (added value_vix, donk_dora,
  mtt_max, straddle_sue, fish_finn) so successive rotations stay fresh.
- `samplePersonas` and `makePersona` now share a `usedNames` set so two seats
  cannot both pick the same persona.

### 4. Bot behaviour upgrades

`HeuristicBot.js` rewritten with four new behaviours:

- **Ante-aware aggression**: when the table has antes, the bot's effective
  aggression rises by up to +0.08 based on `ante × players / bb`, mimicking
  late-stage MTT play where dead chips justify wider steals.
- **Smarter raise sizing**: new `chooseRaiseSize` function picks pot-relative
  fractions tuned per street and equity:
  - Preflop: 2.5× BB open or 3.2× isolation 3-bet
  - Flop/turn: 0.4× / 0.6× / 0.85× pot scaled by equity
  - River bluff: 1.0–1.4× pot polar overbet
- **Difficulty-based mistake injection**:
  - `beginner`: ~10% over-call with weak holdings; ~6% slow-play monsters
  - `advanced`: ~7% river polar bluff when checked to; ~6% thin hero call on
    borderline equity vs small bets
  - `intermediate`: no injected mistakes
- **Texture-aware semibluff weighting**: existing wet/paired board factor now
  feeds equity adjustment before the action tree.

### 5. GTO panel improvements (existing panel benefits from new context)

- Buy-in level structure rebalanced: 60-hand SNG (was 12) with 6-hand levels
  (was 4) so users actually see multiple level changes including ante onset.
- Antes now begin at level 3 with `bb / 8` floor (more meaningful than the
  previous `bb / 10`).
- Bot decisions feed cleaner range data into the existing GtoPanel via the
  upgraded HeuristicBot. No GtoPanel JSX/CSS changes were needed beyond the
  existing Wave 4 sophistication.

### 6. UI/UX polish

- Difficulty badge `pk-diff` (beg / int / adv) rendered next to each bot's
  stack, color-coded blue/yellow/red so the player knows who they're up
  against.
- Live bet badge `pk-bet` shows each seat's `putIn` amount during the hand.
- Raise presets gained `1.5× pot` for polar overbet sizing and renamed `Max`
  to `All-in` for clarity.
- Cash-out confirm dialog uses the Stake red-tinted glass treatment.
- Info strip uses the same glass / border treatment as the title bar so the
  whole top region reads as one connected panel.

## Verification

- `npm test` — 90 / 90 tests pass.
- `npm run build` — pass; chunk sizes stable.
- Smoke `/poker` at 1440×900:
  - Lobby shows updated copy ("up to 60 hands", "Busted bots are replaced").
  - After Sit Down, info strip renders with all seven cells + Cash Out button.
  - Bot seats show `nit_nova`, `straddle_sue`, `fish_finn`, `mtt_max`,
    `value_vix` with difficulty pills.
  - Live bet pills (`GC 10.00`, `GC 20.00`, `GC 60.00`) visible on seats with
    chips in the pot.
  - Raise panel shows `½ pot / ¾ pot / Pot / 1.5× pot / All-in` presets and a
    range slider; default raise is GC 100.00 from the SB.
  - GTO panel right side renders the SB vs MP-open recommendation for the
    actual hero hand (K4o → Fold), with mix bars (Raise 0%, Call 0%,
    Fold 100%), pot odds 31%, SPR 9.0, and EV deltas.
  - No console errors.

## Code touched

- `src/components/PokerGame/PokerGame.jsx` — full rewrite for info strip,
  cash-out flow, bot rotation, expanded persona pool, mid-hand confirm.
- `src/components/PokerGame/PokerGame.css` — info-strip, rotation-log,
  cashout-confirm, difficulty badges, bet badges, hidden legacy pk-sng-status.
- `src/poker/bots/HeuristicBot.js` — full rewrite with ante-aware aggression,
  smarter sizing, difficulty-based mistake injection.

## Known follow-ups (Wave 12 candidates)

- Persistent multiplier widget for cash-game format.
- Stack-based ICM nudges (push/fold charts under 12bb) — currently behaviour
  collapses to "all-in or fold" only via heuristic, not a real ICM table.
- Animated chip-into-pot motion for visual feedback on raises/calls.
- Time-bank UI (current bot decision is fixed 700ms; could add visual countdown).
- Optional rebuy prompt for the human player when stack drops to 0.

## Status

Wave 11 — **shipped**.

## Engagement totals (Waves 6 → 11)

- 20 slot templates, 20 dedicated routes, unique cover art for each.
- 12 per-template benchmark docs, 6 wave docs.
- Slot Factory v2 stage UI, free-spin session loop with retrigger + end banner,
  symbol idle bob + win burst, persistent multiplier widget.
- Engine primitives: line / ways / megaways / cluster / pay-anywhere; cascade
  ladder; money symbols; mystery pre-reveal; sticky-wild lock; multiplier
  zones; multiplier wheel; hold-and-respin; buy-tier picker.
- Plinko engine outcomes split per row count, lazy-loaded.
- Game shell fits one viewport with split fairness/keyboard titlebar groups.
- **Live poker** with persistent info strip, cash-out-early flow, bot
  rotation, ante-aware bot aggression, smarter raise sizing, difficulty-based
  mistake injection, expanded persona pool, mid-hand confirm dialog, live
  bet pills, difficulty badges.
- 90 / 90 tests passing.
