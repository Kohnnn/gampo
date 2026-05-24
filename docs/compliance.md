# Compliance

GamPo is an educational fake-credit simulator. The compliance posture is intentionally conservative.

## Strict do-not list

- No real money, no fiat, no crypto, no payment processors.
- No deposits, withdrawals, transfers, refunds, or rewards with cash value.
- No KYC, no account systems, no identity collection.
- No third-party slot art, branded operator logos, or vendor trademarks.
- No copying of any specific operator's UI screenshots, copy, or visuals into the repo. Look-alike layouts only, written from scratch.
- No targeting of minors. The app is framed as educational for adults.
- No language that implies winnings, payouts, jackpots tied to real value, or bonuses with monetary worth.

## Permitted

- Fake-credit ledger called Practice Credits / GC.
- Educational copy explaining RTP, EV, vig, overround, volatility, hit frequency, bankroll risk.
- Synthetic sportsbook fixtures, with optional server-side provider reads for sports schedules and displayed odds. Provider data is read-only input; ticket acceptance and settlement stay local and synthetic.
- Look-alike lobby rhythm and category rows inspired by mainstream crypto-casino UX patterns, written using GamPo's own CSS and assets.

## Wording sweeps

The team should periodically grep for residual real-money language:

- `wallet`, `deposit`, `withdraw`, `cash`, `crypto`, `money`, `payout`.

If these appear in user-facing surfaces, rewrite them as practice-credit equivalents.

## Disclaimers users see

- Header tag: "Education mode".
- Credit dropdown: "Fake credits only. No cash value, accounts, payouts, or transfers.".
- Chat dock banner: "Simulated chat. Fake credits, fake users, no money.".
- Race page: "Opponents are not real players. Prizes are simulated badges.".

## Sportsbook fetch

`/sports` is a fake-credit sportsbook simulator. `SportsPage.jsx` is a thin wrapper around `src/sportsbook/*`.

The local Vite proxy at `/api/sportsbook/free-feed` can read server-side provider tokens from `.env.local` and fetch SportsGameOdds, PandaScore, odds-api.io, and API-Football. Do not move these tokens into `VITE_` variables or expose token values in docs, browser code, logs, screenshots, or client bundles.

The provider feed does not submit orders, collect user data, or settle against provider markets. It only populates event names, status, and displayed odds when available. The app falls back to The Odds API if configured and then to fully synthetic Gampo fixtures. All settlement remains deterministic local practice-credit simulation.

The Odds Coach may analyze displayed prices, but its copy must stay educational and must not promise profitable prediction.
