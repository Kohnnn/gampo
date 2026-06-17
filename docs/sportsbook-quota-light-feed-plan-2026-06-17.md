# Sportsbook Quota-Light Feed Plan

## Goal

Keep each sport to the 5-12 most useful matches, reduce provider quota burn, show provider logos when available, and make estimated odds feel sport-aware instead of random.

## Plan

1. Cap provider discovery and client curation to 12 events per sport.
2. Stop broad multi-day API-SPORTS scans. Query today first and scan up to two more days only when a sport has fewer than five events.
3. Keep The Odds API in a low-quota mode: one region, `h2h` only. Use the documented no-quota `/sports` endpoint for season metadata.
4. Normalize provider image fields into `homeLogo` and `awayLogo`.
5. Render provider logos only. If a logo is missing, render a blank subdued placeholder with initials, not a generated image.
6. Replace estimated odds with a deterministic calculator using sport profile, home/away name strength, live score, start time, and draw likelihood.
7. Keep estimated odds visibly labeled as estimated.

## Progress

- Added feed constants: minimum five events per sport, maximum 12, maximum 120 total.
- Reduced SportsGameOdds limit from 100 to 60.
- Reduced odds-api.io event discovery to 12 per configured sport and kept odds fanout to 10 IDs.
- Changed The Odds API from US+UK odds calls to US-only `h2h` odds plus `/sports` metadata.
- Reduced API-Football scan from seven days to three.
- Changed API-SPORTS multi-sport scan to stop after a sport reaches five events.
- Added raw sport detection in server-side curation for provider payloads that do not expose `sportId` directly.
- Added provider-logo normalization across SportsGameOdds, PandaScore, odds-api.io, API-Football, API-SPORTS multi-sport, and The Odds API shapes.
- Added `TeamLogo` UI component and wired it into top cards, spotlight cards, featured rows, and event rows.
- Replaced estimated fallback odds with deterministic sport-aware probabilities and sport-specific margin/draw profiles.

## Verification Targets

- Provider proxy source contract reflects quota-light caps and no broad seven-day scan.
- Adapter tests cover logo normalization and estimated odds.
- Sportsbook feed test reflects client cap of 12 per sport and 120 total.
- Full test suite and production build pass.
- Browser smoke on `/sportsbook` desktop and mobile has no console errors and no horizontal overflow.
