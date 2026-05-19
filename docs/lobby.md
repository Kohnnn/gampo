# Lobby

The lobby (`HomePage.jsx`) replicates the rhythm of a modern crypto-casino lobby without copying any specific operator's branded art, names, or layout grids.

## Sections (top to bottom)

1. **Hero**: large title, action buttons (Add credits, Reset, Risk Academy, Verify), and a balance card with a rollover progress bar.
2. **Featured collections strip**: three accent tiles linking to Originals, Arcade Classics, and Sports.
3. **Category rows** (horizontal scroll, snap to start):
   - Originals
   - Casino Tables
   - Arcade Classics
   - Slots
4. **Search & filter workspace**: text search and pill filters (All, Originals, Slots, Table, Arcade, Sports). Filtered results render as a responsive `casino-game-grid`.
5. **Right rail**: Live Studio shortlist, Missions progress bars, Recent Activity.

## Cards

Two card layouts coexist:

- `category-card`: portrait tile used in horizontal rows. Uses `--accent` to drive a radial-gradient art panel and a glow on hover. Min width 168px.
- `casino-game-card`: square tile used in the search grid. Slightly larger image area, RTP and volatility badges in the body.

Both honor the per-definition `accent` color from `gameDefinitions.js`.

## Chat dock

`ChatDock.jsx` mounts inside `Layout.jsx` so it persists across all routes. It has two tabs:

- **Chat**: simulated-only. A banner reads "Simulated chat. Fake credits, fake users, no money.". Messages tick in every 6 seconds from a pool of 14 fake usernames and short canned phrases. The user can type messages locally; nothing is networked.
- **Race**: a compact view of the leaderboard from `SocialContext`. Synthetic opponents sit alongside the user's local wagered volume.

The dock can be collapsed to a floating green action button.

## Race page

`/race` shows the full race board with prizes (badges only, no cash value) and a clear "opponents are simulated" disclaimer.

## Verify page

`/verify` lists recent bet/win transactions as a placeholder for a future seed/nonce display per game. See `provably-fair.md` for the planned model.
