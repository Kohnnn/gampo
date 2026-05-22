# Game UX Normal-Zoom Progress - 2026-05-22

## Goals

1. Make every game usable at 100% browser zoom without permanent history/stats taking center space.
2. Fix session stats so the ChatDock stats panel updates for all game sessions.
3. Improve Crash odds controls and simulated-player feel.
4. Improve GTO, Roulette, Slots, and game navigation enough to remove the most obvious rough edges.
5. Keep changes shared and minimal where possible.

## Implementation Plan

1. Convert the shared game shell from a fixed three-column layout to a two-column primary layout at normal desktop widths.
2. Move full history behind a compact expandable drawer; keep only compact stats visible.
3. Route all `useGameSession().record()` calls through global PnL recording.
4. Add richer Crash target presets and better crash-side previews.
5. Rework the GTO panel around a decision card first, range grid second.
6. Compact Roulette advanced bet rows and improve result/winning-number feedback.
7. Improve Slots reel motion with per-column cycling and stronger line-win visuals.
8. Add sidebar game search and category grouping to reduce navigation noise.
9. Build and record verification notes.

## Progress

- Completed: document created before implementation.
- Completed: shared `GameShell` now defaults to a two-column layout at normal desktop widths and only uses the permanent right aside on very wide screens.
- Completed: titlebar/playfield spacing was reduced so games fit better at 100% zoom.
- Completed: `HistoryDrawer` is now collapsed by default and no longer permanently consumes vertical space.
- Completed: compact stats now flow horizontally in the bottom aside at normal desktop widths.
- Completed: `useGameSession` now guards global PnL mirroring by entry id to prevent duplicate/stale records while preserving ChatDock stat updates.
- Completed: Crash target presets now include `25x`, `50x`, and `100x`, with target/profit/risk preview.
- Completed: GTO panel now emphasizes the primary decision card and exact raise/call/fold mix.
- Completed: Roulette advanced bets are collapsed behind an `Advanced bets` drawer and winning numbers highlight on the board.
- Completed: Slots now cycles visible symbols while reels spin, then lands final results at settlement.
- Completed: sidebar Games navigation now has search and grouped categories.

## Verification Checklist

- `npm run build` passes.
- At 100% zoom, Crash, Roulette, Slots, Plinko, and Mines fit without a permanent right history panel stealing playfield width.
- ChatDock Stats changes after a game record settles.
- Crash offers targets beyond `10x` and shows useful chance/profit context.
- Roulette highlights the winning number on the board.
- Slots columns visually spin/cycle before stopping.
- Sidebar search filters games without affecting route navigation.
