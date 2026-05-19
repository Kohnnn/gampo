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
- Synthetic sportsbook fixtures, with a best-effort live read from a free public sports API (currently TheSportsDB) when available. The fetch is read-only and used only to populate fixture names; settlement is local and synthetic.
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

`SportsPage.jsx` performs one optional fetch to TheSportsDB's public endpoint to enrich the fixture list with real club names. It does not stake real money against the live data, does not transmit any user data, and falls back silently to fully synthetic fixtures.
