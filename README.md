# GamPo Educational Simulator

GamPo is a frontend-first Vite React app for learning probability with fake credits only. It includes casino-style simulator games and a synthetic sportsbook lab, with visible RTP, house edge, expected value, hit frequency, volatility, bankroll risk, rollover math, and betting psychology notes.

## Scope

- Fake practice credits stored locally in the browser.
- No accounts, cash-value balances, transfers, external markets, or money movement.
- Playable v1 games: Crash, Plinko, Mines, Dino Run, Dice, Limbo, Keno, Wheel, Roulette, Blackjack Trainer, and Slots Simulator.
- Synthetic sportsbook route at `/sports` with generated fixtures, odds movement, ticket settlement, implied probability, overround, vig, fair odds, and EV explanations.
- Simulation helpers are isolated under `src/utils` and `src/context` so a future OCI Node API can replace browser storage.

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run build
```

## Notes

The math is intentionally educational and plausible rather than certified for production wagering. The interface prioritizes an interactive, polished learning prototype with clear fake-credit boundaries.
