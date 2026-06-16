# Poker And Sportsbook Shipping Plan

## Goal

Ship the follow-up repair batch for three production issues:

- Desktop poker UI/UX is unreadable compared with the now-acceptable mobile flow.
- Leaving poker through global navigation can bypass the local cash-out warning and lose the table stack.
- Sportsbook should show many more real-world events, prefer real odds when available, and fill missing prices with clearly marked estimated odds.

## Poker Desktop Repair

Desktop keeps the casino-table feel, but the final CSS source of truth must be desktop-specific instead of relying on the older oval/absolute-seat rules.

- Add a final `@media (min-width: 769px)` poker override block.
- Keep the phone layout untouched except for any shared card visual improvements.
- Make the felt wider and stable across `1440x900` and larger desktop screens.
- Use fixed, non-overlapping desktop seat coordinates for six players.
- Keep opponent cards readable without making them compete with the hero cards.
- Keep hero cards and board cards larger than opponent cards.
- Place the action bar below the table on desktop, not as a sticky overlay competing with the felt.
- Reduce sidebar dominance by giving the table more horizontal priority.

Acceptance:

- No desktop horizontal overflow.
- Seats, pot, board, buttons, and cards do not overlap.
- Opponent name, stack, action, bet, and cards are readable.
- Mobile poker flow remains opponents -> pot -> board -> hero -> actions.

## Poker Exit Guard

The current warning only covers browser/tab close and the local `‹ Hub` link. It misses sidebar links, header logo/search, mobile bottom nav, browser back, and programmatic navigation.

Implement a poker-owned guard that intercepts any document-level in-app navigation away from `/poker` while the player is seated with stack > 0.

Guard behavior:

- `Cash out and leave`: return current stack to the practice balance, clear the table, then continue navigation.
- `Stay seated`: cancel navigation and keep the table.
- `Leave without cashing out`: explicitly abandon the table stack and navigate.
- Browser/tab close still uses `beforeunload`, because browsers do not allow custom modal UI there.

Acceptance:

- Header logo, sidebar, mobile bottom nav, browser back, and poker Hub exit all produce the guard.
- Cash-out path returns the current stack before leaving.
- Explicit abandon path is possible only after the warning is shown.

## Sportsbook Real Fixtures + Estimated Odds

Provider tokens stay server-side. Do not add keys to source, docs, tests, or any `VITE_` variable.

Supported env names:

- `API_FOOTBALL_TOKEN=key1,key2`
- `api-football_token=key1,key2`
- `PANDASCORE_TOKEN=key1,key2`
- `pandascore_token=key1,key2`

Provider plan:

- Add comma-separated key rotation for API-Football and PandaScore.
- Keep 5 minute server-side cache.
- API-Football uses `https://v3.football.api-sports.io` with `x-apisports-key`.
- API-Football loads a small forward date window using `/fixtures` and `/odds` with `bet=1` where available.
- PandaScore uses `https://api.pandascore.co/matches/upcoming` with `Authorization: Bearer <token>`.
- PandaScore requests up to 100 upcoming matches and sorts by `begin_at`.

Feed blending:

- Real provider odds rank first.
- Real provider fixtures without bookmaker prices are kept and receive deterministic estimated odds.
- Estimated odds must be marked on event tags, selection source, and visible UI copy.
- Full synthetic Gampo-owned fixtures remain only as an offline/no-real-fixtures fallback.

Estimated odds requirements:

- Odds are deterministic from event ID, teams, sport, and league.
- Soccer can have 1x2; non-draw sports/esports use two-way winner markets.
- Selection source is `synthetic-estimate`.
- Event tags include `estimated-odds`.
- Bookmaker title reads `Estimated odds`.
- Odds Coach explains that estimated odds are GamPo-generated learning prices, not bookmaker odds.

Acceptance:

- Live/blended sportsbook has more actual-event fixtures than before.
- Real odds are preserved when present.
- Estimated odds are obvious in event cards, odds buttons, and education copy.
- No fake practice teams appear while real fixtures are available.
- Provider keys remain server-only.

## Verification

Focused checks:

```powershell
rtk npx vitest run src/components/PokerGame/PokerGameCss.test.js src/sportsbook/sportsbookFeed.test.js src/sportsbook/freeFeedAdapters.test.js src/sportsbook/sportsbookProviderProxySource.test.js
```

Full checks:

```powershell
rtk npm test
rtk npm run build
rtk npm run audit:all
```

Browser smoke:

```powershell
rtk node scripts/browserSmoke.mjs --routes=/poker,/sportsbook --viewports=390x844,1440x900
```

Manual browser checks:

- Poker desktop after sitting down.
- Poker navigation guard from header/sidebar/mobile nav.
- Sportsbook shows real-event estimated odds with visible markers.
