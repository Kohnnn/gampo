# Sportsbook

`/sports` is Gampo's fake-credit sportsbook surface. It is a dense sportsbook-style simulator with an internal sport rail, central market workspace, right betslip rail on desktop, and mobile search/betslip overlays.

The implementation uses the Stake sportsbook audit pack only as layout and behavior reference. It does not copy Stake source, CSS, SVG paths, images, icons, team crests, CDN resources, or proprietary assets.

## Architecture

- Route wrapper: `src/pages/SportsPage.jsx`
- Feature shell: `src/sportsbook/SportsbookShell.jsx`
- Data and feed: `src/sportsbook/sportsbookData.js`, `src/sportsbook/sportsbookFeed.js`
- Math and state: `src/sportsbook/sportsbookMath.js`, `src/sportsbook/sportsbookState.js`
- Components: `src/sportsbook/components/*`
- Styles: `src/styles/sportsbook.css`

The public route remains `/sports`. `SportsPage.jsx` is intentionally thin so sportsbook layout, data normalization, selection state, ticket placement, search, event detail, and mobile overlays stay inside the sportsbook feature folder.

## Data Sources

Synthetic Gampo-owned fixtures are always available and drive the default UI states:

- sports, leagues, events, live clocks, scores, popularity, tags
- winner, totals, spread/handicap, props, racing, and correct-score style market groups
- selected, suspended, odds-up, odds-down, and boosted selection states

Optional live feed support remains:

- The Odds API via `src/services/sportsApi.js`
- `fetchUpcomingOdds(region)`
- `fetchInSeasonSports()`
- `fixtureFromOddsApi(event)`

Free provider support is layered through a local Vite proxy:

- Proxy endpoint: `/api/sportsbook/free-feed`
- Proxy implementation: `server/sportsbookProviderProxy.js`
- Client normalization: `src/sportsbook/freeFeedAdapters.js`
- Supported `.env.local` names: `SportsGameOdds_token`, `pandascore_token`, `odds-api_token`, `api-football_token`
- Source roles:
  - SportsGameOdds: preferred free primary odds feed for NBA, NFL, MLB, NHL, NCAAB, and NCAAF moneyline, spread, and total markets
  - PandaScore: esports schedules and matchup context
  - odds-api.io: free-tier sports/esports events and odds where available
  - API-Football: soccer fixtures and match-winner odds where available; the proxy uses today's date and joins fixtures to odds because free plans can reject `next` and `ids` parameters

These provider tokens are server-side only. Do not move them into `VITE_` variables. If the proxy is unavailable, the app falls back to The Odds API if configured and then to synthetic Gampo fixtures.

Roadmap reference: keep expanding SportsGameOdds coverage first because its event/market model is the closest fit for Gampo's normalized sportsbook data. Next useful additions are alternate lines, player props, and soccer league filters when the active SportsGameOdds tier supports EPL/UEFA-style leagues.

`sportsbookFeed.js` normalizes optional API events into the same event and market shape as synthetic events. If the feed fails, the sportsbook keeps rendering synthetic fixtures.

## Betting Flow

All betting is practice-credit only.

- Default betslip mode is Singles.
- Multi/parlay and 2-of-N system tickets are available from the betslip mode tabs.
- Default odds policy is `Accept Only Higher Odds`.
- Worse odds changes require manual acceptance before the `Place Practice Bet` button can submit.
- Suspended selections block ticket placement.
- Practice stake must be greater than zero and cannot exceed the current practice balance.

Ticket settlement uses deterministic seeded simulation through `createRoundRng`, not direct `Math.random()`. Accepted odds are stored on the ticket so later odds movement does not rewrite settled or accepted tickets.

## Education Model

Education is contextual through the Odds Coach instead of a separate lesson page.

- Odds cells expose `Analyze odds`: decimal odds, break-even chance, no-vig fair chance when a full market exists, model edge, movement, status, and provider caveat.
- Market groups expose `Analyze market`: market-type explanation, overround, vig, de-vig probability table, and notes about why all outcomes can look slightly overpriced.
- Bet slip exposes `Analyze ticket`: singles stake split, multi/parlay multiplied odds, 2-of-N system combinations, estimated return versus profit, EV hint, same-game correlation warning, and odds-change policy.
- Settled tickets expose `Review`: stake, returned practice credits, profit, leg probability, deterministic roll, accepted odds snapshot, return role, and neutral decision-quality copy such as good decision / bad result or bad price / lucky result.

The coach uses compact sections. `Basics` opens first by default, while `Analysis` and `Sharp Notes` stay expandable so education remains secondary to the sportsbook surface.

- `Basics`: beginner-friendly break-even, status, estimated return, and market explanations.
- `Analysis`: no-vig, vig, system combinations, and odds-change mechanics.
- `Sharp Notes`: model-vs-price, source caveats, correlation, and accepted-price review.

The analysis is for learning only. It must not claim profitable prediction or wagering advice.

## UI Surfaces

Desktop:

- internal sport rail with Live Events, Starting Soon, All, My Bets, top sports, all sports/esports/racing groups
- sportsbook home with promo strip, search trigger, section nav, top matches, outrights, top sports, and popular events
- compact event rows with league/date headers, live score/clock, market labels, odds cells, and `+N` market affordance
- event detail view with breadcrumbs, tabs, market filters, advanced stats, market accordions, and shared betslip selection
- sticky right betslip with empty, selected, odds-changed, placing, accepted, and settled states

Mobile:

- single-column sportsbook home
- horizontal promo strip
- bottom nav for Browse, Casino, Bet Slip, Sports, and Chat
- full-screen search overlay
- full-height betslip bottom sheet

## Compliance Limits

- No deposits, withdrawals, crypto wallets, cash-value balance, account wagering, real order submission, KYC, or provider RGS.
- CTA language uses fake-credit wording, e.g. `Place Practice Bet`.
- Bookmaker/API data is optional display input; all settlement remains local simulation.

## Verification

Run:

```powershell
cd D:\gampo
npm run build
npm test
```

Focused sportsbook checks:

```powershell
cd D:\gampo
npm test -- src/sportsbook/sportsbookEducation.test.js src/sportsbook/sportsbookMath.test.js src/sportsbook/sportsbookState.test.js src/utils/sportsApi.test.js
```

Browser-check `/sports` at:

- `1440x900`: desktop home, selected betslip, event detail, odds changed, suspended odds, odds coach from odds cell, market, betslip, and settled ticket
- `390x844`: mobile clean home, search overlay, betslip bottom sheet, coach drawer without overlap

Acceptance points:

- No horizontal overflow.
- No text overlap.
- Odds cells remain tappable and readable.
- Odds Coach triggers do not resize odds cells or block selection.
- Bet slip footer actions stay reachable.
- Synthetic data renders even when external feed calls fail.
- Free provider tokens are never exposed to browser code or documentation.
