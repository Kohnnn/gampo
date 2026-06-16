# Poker Cards + Sportsbook Depth Repair Plan

## Goals

- Repair live poker card visuals across desktop and mobile.
- Keep poker exits safe by warning seated players to cash out before leaving.
- Expand sportsbook depth so the home page targets at least the top 5 games per major sport where provider/crawl data exists.
- Preserve server-side API key handling and fake-credit-only settlement.

## Poker Plan

- Replace noisy neon card backs with clean, readable card faces and calm patterned backs.
- Use role-specific sizing for board cards, hero cards, opponent cards, and placeholders.
- On mobile, order table content as opponents, pot/board, hero, then actions. Actions must be in-flow and cannot cover hero cards.
- Add `beforeunload` and Hub navigation warnings while seated with chips: cash out before leaving or the current table stack will not return to balance.
- Lock the behavior with CSS/source contract tests.

## Sportsbook Plan

- Change strict marquee filtering into marquee-first curation with depth fill.
- Target top 5 events for each major sport: soccer, basketball, football, tennis, baseball, ice hockey, cricket, esports, and horse racing where available.
- Use providers first; when providers are rate-limited or sparse, add curated snapshot/fallback rows so the page does not collapse to one match.
- Keep famous competitions ranked first, but keep enough quality events visible to feel like a real sportsbook.
- Expose curation metrics for candidates, shown, skipped, marquee, and fill counts.

## Verification

- Poker CSS/source tests.
- Sportsbook marquee/feed tests.
- Production build.
- Netlify production deploy.
