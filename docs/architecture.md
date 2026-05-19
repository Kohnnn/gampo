# Architecture

## Stack

- React 18, Vite 5, React Router 6.
- Ant Design 6 for selected wrappers (will be reduced over time).
- Tailwind 4 utilities are configured but used sparingly; most styling is hand-written CSS.
- Vitest for the small math test surface.

## Directory map

```
src/
  App.jsx                 # router
  main.jsx                # bootstrap, providers
  components/
    Header.jsx            # top bar + practice credits dropdown
    Sidebar.jsx           # left nav (casino + games)
    Layout.jsx            # composes Header, Sidebar, ChatDock
    ChatDock.jsx          # simulated chat + race tab
    EducationPanel.jsx    # shared probability/EV panel
    CrashGame/            # full Crash engine (legacy heavy)
    DinoGame/             # Phaser-based Dino (legacy heavy)
    MinesGame/            # Mines engine
    PlinkoGame/           # Matter.js Plinko
    SimulatorGames/       # generic table/arcade simulators
    ui/                   # shadcn-style primitives
  context/
    CreditContext.jsx     # local fake-credit ledger
    SocialContext.jsx     # simulated chat + race
  data/
    gameDefinitions.js    # core game catalogue
    casinoCatalog.js      # lobby sections, slots, missions, vip
  pages/
    HomePage.jsx          # lobby with category rows
    SportsPage.jsx        # sportsbook lab
    CasinoPages.jsx       # originals, slots lobby, live, missions, vip, learn, activity, verify, race
    PlinkoPage.jsx etc.   # game wrappers
  styles/
    casino.css, sports.css, education.css, home.css, index.css
  utils/
    simulationMath.js     # RTP, EV, vig, kelly-style helpers
    ProvablyFair.js       # seed/nonce hashing (legacy)
```

## State and providers

- `CreditProvider` owns balance, transactions, and toasts. Persists to `localStorage` under `gampo_*` keys.
- `SocialProvider` owns simulated chat messages and a derived race leaderboard. The user's wagered volume is read from `CreditContext`. Race opponents are fully synthetic; chatter is synthesized client-side at a 6 second tick.

## Routing

`App.jsx` mounts everything under `Layout`. Each game has a top-level path; `/originals`, `/slots-lobby`, `/live`, `/missions`, `/vip`, `/learn`, `/activity`, `/verify`, `/race`, and `/sports` are first-class lobby surfaces.

## RNG model

- Most games use `Math.random` for in-game outcomes today.
- `simulationMath.js` exposes `createSeededRandom(seed)` that returns a deterministic generator. The sportsbook lab seeds daily fixtures with `gampo-sports-<date>` so all users see consistent data per day.
- `provably-fair` page reads recent transactions and shows their stable IDs as a verification surface. The roadmap calls for surfacing per-roll seed/nonce in every game.

## Bundle

The build emits a single large JS chunk (~21 MB unminified, ~8.6 MB gzip). Phaser, Matter, Chart.js, and Ant Design are the heavy contributors. Code splitting is documented in `roadmap.md` as the next perf pass.
