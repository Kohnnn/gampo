# Sportsbook

`/sports` is GamPo's educational sportsbook. It uses **The Odds API** for live decimal odds and **TheSportsDB** for historical results, with aggressive caching and key rotation. All settlement is local and simulated against practice credits.

## Data sources

### The Odds API (live odds)

- Endpoint base: `https://api.the-odds-api.com/v4`
- Used endpoints:
  - `GET /sports?apiKey=…` — list in-season sports (cached 24h)
  - `GET /sports/upcoming/odds/?regions={region}&markets=h2h&oddsFormat=decimal&apiKey=…` — upcoming markets per region (cached 10 min)
  - `GET /sports/{sportKey}/odds/?regions=us,uk&markets=h2h&oddsFormat=decimal&apiKey=…` — per-sport markets (cached 10 min)
- Free-tier quota: 500 requests/month per key. We rotate three keys to multiply this.

### TheSportsDB (historical / educational)

- Endpoint base: `https://www.thesportsdb.com/api/v1/json/3`
- Used endpoints:
  - `GET /eventsday.php?d=YYYY-MM-DD&s=Soccer` — events for a given day (cached 24h)
  - `GET /lookupevent.php?id=…` — event detail (cached 24h)
- No key required for the public v3 endpoints.

## Service module

`src/services/sportsApi.js` exposes:

- `fetchInSeasonSports()` — `{ data, cached, errors }`
- `fetchUpcomingOdds(region)` — `{ data, cached, errors }`
- `fetchOddsForSport(sportKey, { regions, markets })` — `{ data, cached, errors }`
- `fetchEventsForDay(dateStr, sport)` — TheSportsDB historical
- `fetchEventDetail(eventId)` — TheSportsDB lookup
- `getQuotaSnapshot()` — last seen `x-requests-used` / `x-requests-remaining` per key
- Helpers: `impliedFromDecimal`, `bestBookmakerPrice`, `fixtureFromOddsApi`

## Key rotation

The service maintains a small round-robin index in `localStorage` plus a per-key cooldown map.

- Source order: `import.meta.env.VITE_ODDS_API_KEYS` (comma-separated) → falls back to a hardcoded list.
- On HTTP 401/403 → cool down that key for 60 minutes and rotate.
- On HTTP 429 → cool down that key for 30 minutes and rotate.
- On other errors → just rotate (no cooldown).
- If every key is in cooldown, the call returns `{ data: null, errors }` and the UI keeps showing whatever cached fixtures it has.

## Caching

All Odds API and TheSportsDB calls go through a `localStorage`-backed cache:

| Endpoint                         | TTL    |
|----------------------------------|--------|
| `/sports` (list)                 | 24h    |
| Upcoming odds (per region)       | 10 min |
| Per-sport odds                   | 10 min |
| TheSportsDB events for a day     | 24h    |
| TheSportsDB event detail         | 24h    |

Cache keys are derived from the URL + query string. The "Refresh odds" button forces a refetch but still respects key cooldowns.

## Quota chip

The header of `/sports` shows the **remaining quota** summed across all known keys, read from response headers (`x-requests-remaining`). It is updated after every successful request.

## UI features

- Region toggle (US / UK).
- Sport tabs derived from `in-season sports` plus "All" and "Live".
- F1 is included if `motorsport_f1_*` keys appear in the in-season list (the simulator additionally treats it as fantasy).
- Per-fixture market grid with implied probability + fair-odds badge.
- **Drift indicators**: when odds change between refreshes, market buttons flash green or red and show an arrow. Educational only; on a real book this would prompt strategy discussions.
- **Bet builder**: the slip allows multiple legs from the same fixture. Parlay mode shows a yellow correlation warning explaining that real books often block these legs.
- Singles / Parlay / System modes with combined odds, implied chance, model chance, and EV.
- **Educational history**: pick a date → load past Soccer fixtures from TheSportsDB → compare scorelines to estimated fair odds.

## Compliance

- No real-money flow. Practice credits only.
- No real-book branding embedded in the UI; bookmaker names come straight from the API response and are displayed as plain text.
- Keys are read-only. The free Odds API tier is sufficient for personal/educational use.

## Risks and notes

- **Client-side keys**: keys are exposed to anyone using the deployed app. For a public deploy, move to a tiny serverless proxy. Documented in `compliance.md`.
- **API outages**: when the live feed fails, the sim still renders synthetic fixtures so the lab keeps working.
- **Caching**: clearing browser storage wipes both the cache and the cooldown map; the next page load will re-fetch.
