Original prompt: Implement GamPo as an educational fake-credit casino and sportsbook probability simulator using the existing Vite React app, current four game engines, added simulator games, synthetic sportsbook, education panels, local practice credits, tests, and a real-money wording scan.

## Progress

- Replaced wallet storage/context with `CreditContext` and `gampo_*` localStorage keys.
- Added shared probability helpers and game definition data.
- Added a reusable education panel and simulator implementations for Dice, Limbo, Keno, Wheel, Roulette, Blackjack Trainer, and Slots.
- Rebuilt the hub as a searchable simulator workspace with practice-credit controls and recent simulation history.
- Added `/sports` with generated fixtures, odds movement, overround/vig, fair odds, EV, a practice ticket, and settlement history.
- Added education docks for the original Crash, Plinko, Mines, and Dino surfaces.
- Added Vitest coverage for pure probability/math helpers and scoped Vitest to app tests under `src`.
- Browser-smoked the hub, existing game routes, new game routes, and sportsbook; direct interactions verified Add Credits, Dice roll, sports market selection, and sports ticket settlement.
- Refactored the app into a fuller casino-style simulator shell using the example folder as reference: copied usable Xaxino play/game/banner assets into `public/example-assets`, added lobby sections for originals, slots, synthetic live tables, missions, VIP/risk learning, and activity.
- Added example-inspired arcade/card simulators for Coin Flip, Rock Paper Scissors, Guess Number, and Hi-Lo Cards with animated playfields, fake-credit settlement, and education panels.
- Browser-smoked the expanded routes and verified a live Coin Flip settlement plus mobile layout behavior.

## Current Focus

- Completed for this pass.

## Notes

- `npm install` reported dependency audit findings in the existing tree; no forced dependency upgrade was applied.
- `npm run build` succeeds but Vite warns that the bundle is large, mainly from the existing all-in app/game dependencies.
