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

Free provider support is layered through a local Vite/Netlify proxy:

- Proxy endpoint: `/api/sportsbook/free-feed`
- Proxy implementation: `server/sportsbookProviderProxy.js`
- Client normalization: `src/sportsbook/freeFeedAdapters.js`
- Supported `.env.local` / Netlify names: `SportsGameOdds_token`, `PANDASCORE_TOKEN`, `pandascore_token`, `ODDS_API_IO_TOKEN`, `odds-api_token`, `API_FOOTBALL_TOKEN`, `api-football_token`
- API-Football and PandaScore accept comma-separated token rotation, for example `API_FOOTBALL_TOKEN=key1,key2` and `PANDASCORE_TOKEN=key1,key2`
- Source roles:
  - SportsGameOdds: preferred free primary odds feed for NBA, NFL, MLB, NHL, NCAAB, and NCAAF moneyline, spread, and total markets
  - PandaScore: esports schedules and matchup context from `https://api.pandascore.co/matches/upcoming`, authenticated with `Authorization: Bearer <token>`; requests use `per_page=100` and `sort=begin_at`
  - odds-api.io: free-tier sports/esports events and odds where available
  - API-Football: soccer fixtures and match-winner odds where available from `https://v3.football.api-sports.io`, authenticated with `x-apisports-key`; the proxy scans a 7-day date window and joins `/fixtures?date=YYYY-MM-DD` with `/odds?date=YYYY-MM-DD&bet=1`

These provider tokens are server-side only. Do not move them into `VITE_` variables. If one rotated key returns auth/rate-limit errors, the proxy skips that key for the current process cooldown and tries the next configured key. If all real providers fail, the app falls back to synthetic Gampo fixtures.

Roadmap reference: keep expanding SportsGameOdds coverage first because its event/market model is the closest fit for Gampo's normalized sportsbook data. Next useful additions are alternate lines, player props, and soccer league filters when the active SportsGameOdds tier supports EPL/UEFA-style leagues.

`sportsbookFeed.js` normalizes optional API events into the same event and market shape as synthetic events. If provider fixtures are available, the sportsbook uses a blended real-event mode: real bookmaker odds rank first, and real fixtures without bookmaker prices receive deterministic GamPo estimated odds. Synthetic Gampo-owned fixtures are only used as an offline/no-real-fixture fallback.

### Estimated Odds

Estimated odds exist to make real scheduled fixtures playable in the fake-credit simulator when the fixture provider supplies teams and timing but no bookmaker prices.

- Event tags include `estimated-odds`.
- Selection source is `synthetic-estimate`.
- Event `bookmakerTitle` is `Estimated odds`.
- Odds buttons show an `Est.` badge.
- Odds Coach labels the price as a GamPo-estimated learning price and not a bookmaker quote.
- Settlement remains local deterministic practice simulation.

Estimated odds are generated deterministically from the normalized event id, sport, teams, and league context. They must never be described as real odds, sharp predictions, or wagering advice.

### Big-Match Quota Guard

The live feed is big-match-first by default so API quota is not wasted on low-signal fixtures.

- Marquee seed: `public/data/sportsbook-marquee.json`
- Shared scoring/filtering: `src/sportsbook/sportsbookMarquee.js`
- Server-side filtering: `server/sportsbookProviderProxy.js`
- UI diagnostics: Sports Home `Real-event feed guard active` strip

The snapshot lists famous competitions and team keywords such as FIFA World Cup, UEFA/Champions League, top domestic soccer leagues, NBA/NFL playoffs, UFC main cards, and Grand Slam tennis. The proxy filters provider payloads through this shortlist and exposes `marquee` metrics (`candidateCount`, `shownCount`, `skippedCount`, `marqueeCount`, `bigMatchOnly`) so the UI can show how much noise was skipped. If no marquee match exists, the app fills from the best per-sport real-event candidates instead of blanking the sportsbook.

### Provider Documentation Notes

- PandaScore docs fetched successfully. Relevant documented behavior: REST API tokens are private and should not be used in client-side applications; REST supports Bearer token auth; `/matches/upcoming` is available to all customers; `per_page` / `page[size]` can request up to 100 items; sorting/filtering are URL query parameters; remaining quota is exposed through `X-Rate-Limit-Remaining`.
- API-Football's public docs returned `403` to automated documentation fetches during this pass. The implementation follows the existing official API-SPORTS endpoint contract already used in the app: `https://v3.football.api-sports.io`, `x-apisports-key`, `/fixtures`, and `/odds` with match-winner `bet=1`.

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
