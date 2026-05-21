# Tiny Review Improvements - 2026-05-21

## Plan

1. Make the PnL history chart visibly move when new settled bets are recorded.
2. Clean the sidebar into readable categories, remove action-button glow, and move Live Poker near the top of Games.
3. Upgrade Live Poker with selectable buy-ins, randomized bot personas, contextual table chat bubbles, and richer GTO metrics.
4. Reduce Plinko big-win overlay spam during multi-ball/autoplay by raising the threshold and adding cooldown.
5. Add stronger slot win signaling with a win callout, reel-frame flash, symbol pulse, and existing particles.
6. Improve Crash simulated-player presence so the player strip persists and shows live/pending/cashed states.
7. Refresh the game cover aesthetic and wire new cover resources for Crash, Plinko, Mines, and Dino.
8. Reframe Promotions, Missions, and VIP Lab as a single-player casino education/progression loop.

## Progress

- Completed: Stats chart updates now refresh labels/data together and animate instead of snapping silently.
- Completed: Sidebar now has Casino, Progress, Account, Utility, and Games sections. Utility buttons use normal nav styling.
- Completed: Live Poker supports `200`, `500`, `1000`, and `10000` GC buy-ins.
- Completed: Live Poker samples five unique bot personas from a larger persona pool each session.
- Completed: Bot decisions use persona aggression and generate contextual chat bubbles at the table.
- Completed: GTO panel now shows pot odds, SPR, range-raise frequency, continue frequency, and a short suggestion explanation.
- Completed: Plinko big-win overlay now requires `15x+` and has a `4.5s` cooldown to avoid multi-ball spam.
- Completed: Slots now displays a win callout, stronger winning-symbol pulse, and frame flash.
- Completed: Crash simulated players are visible in idle/running/settled states and show live pending rows while a round runs.
- Completed: Missions and VIP tiers were expanded around education, single-player quests, table reading, verification, and volatility study.
- Completed: New local cover resources were added at `public/images/covers/{crash,plinko,mines,dino}.svg` and wired in `gameDefinitions.js`.

## Asset Generation Note

The requested 9Router image generation could not run in this shell because `NINEROUTER_URL` and `NINEROUTER_KEY` were not set. To keep shipping unblocked, the app now uses newly created vector cover resources with the intended dark casino/originals vibe. When 9Router credentials are available, replace these SVGs with generated raster covers using the prompts below.

## 9Router Prompts

- Crash: `Premium online casino game cover for Crash, dark navy Stake-style UI vibe, rocket flying up a green multiplier curve, orange bust glow, glossy 3D arcade asset, no real-money text, no brand logos, 16:9 composition, clean space for title.`
- Plinko: `Premium online casino game cover for Plinko, dark navy and neon green, golden coin falling through glowing pegs into multiplier bins, Stake originals style, glossy 3D arcade asset, no brand logos, no real-money claims, 16:9.`
- Mines: `Premium online casino game cover for Mines, dark navy grid of tiles, glowing cyan gems and one ominous bomb tile, clean casino original aesthetic, glossy 3D icons, no brand logos, no real-money claims, 16:9.`
- Dino Run: `Premium arcade casino game cover for Dino Run, dark navy desert track, white pixel-inspired dinosaur jumping obstacles, gold and green glow, modern Stake originals vibe, no brand logos, no real-money claims, 16:9.`

## Follow-Up

- Run 9Router image generation after credentials are configured and save outputs over the current SVG cover paths or update `gameDefinitions.js` to point at generated PNG/WebP files.
- Playtest Live Poker for bot pacing and adjust persona aggression if any profile feels too loose or too tight.
