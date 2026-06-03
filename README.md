# GamPo Educational Simulator

GamPo is a Vite + React fake-credit casino and sportsbook probability simulator. It is for education and UI/gameplay prototyping only: balances are local practice credits with no cash value, no accounts, no withdrawals, no transfers, and no real betting.

Production: [https://gampo-educational-simulator.netlify.app](https://gampo-educational-simulator.netlify.app)

## Current App

- Lobby and discovery for Originals, Slots, Cases, Poker/Card Room, Live Studio, Missions, VIP Lab, Risk Academy, and Activity.
- Originals include Crash, Plinko, Mines, Dice, Limbo, Keno, Wheel, Roulette, Blackjack, Baccarat, Hi-Lo, Tower, Chicken Cross, Tarot, Cases, and other practice simulators.
- Slots include the Slots Lobby plus template routes such as `/vault-rush`, `/bars`, `/scarab-spin`, `/miko-spirit`, and `/ghostblade-strike`.
- Sportsbook is canonical at `/sportsbook`; `/sports` remains a compatibility alias. Supported views include `/sportsbook/live`, `/sportsbook/starting`, `/sportsbook/all`, `/sportsbook/my-bets`, and `/sportsbook/:sportId`.
- The sportsbook uses synthetic fixtures by default. Optional provider reads stay server-side through `server/sportsbookProviderProxy.js`; ticket acceptance and settlement remain local fake-credit simulation.

## Run Locally

```bash
npm install
npm run dev
```

## Required Verification

```bash
npm test -- --run
npm run build
npm run smoke:browser -- --routes=/,/sportsbook,/sportsbook/soccer,/vault-rush,/bars,/scarab-spin,/miko-spirit,/ghostblade-strike,/slots-lobby,/blackjack,/roulette,/plinko,/mines --viewports=375x667,480x800,1024x768,1610x870
```

Browser smoke output is written under `output/browser-smoke/`.

## Deploy

Netlify is configured by `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA fallback: `/* -> /index.html`
- Node version: `20`

Use `npx netlify deploy --build` for a draft preview and `npx netlify deploy --build --prod` for production.

## Repository Hygiene

Reference and template folders are intentionally ignored and should not be committed:

- `.agents/`
- `GameTemplate/`
- `example/`
- `stake-clone/`
- local dev, preview, zrok, and Vite timestamp logs

Generated smoke artifacts belong in `output/` and are also ignored.
