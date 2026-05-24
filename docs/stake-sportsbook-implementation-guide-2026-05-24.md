# Stake Sportsbook Reference To Gampo Implementation Guide

This guide is for the next AI agent improving only the Gampo sportsbook experience. Do not use the casino, originals, slots, Rainbet, or Stake slot materials for this pass except as general app context. The source material for this pass is the Stake sportsbook audit pack.

## Audit Root

Use this local audit pack:

`D:\gampo\rainbetclone\stake-sportsbook-audit-2026-05-24\`

Important files:

- `stake-sportsbook-audit.md` - master index and implementation priority summary.
- `screenshots\` - 50 verified PNGs across desktop, event detail, betslip, search, and mobile sportsbook surfaces.
- `notes\*.md` - behavior-level UI/UX notes per captured surface.
- `raw-observations\*.json` - DOM, accessibility, computed style, console, and frame summaries.
- `asset-inventory\stake-sportsbook-assets.json` - network/resource metadata only. All `downloaded` values should remain `false`.

Policy:

- Screenshots are reference material for layout, rhythm, state design, and density.
- Do not copy Stake source code, minified JS, SVG paths, CSS, images, icons, team crests, CDN assets, or proprietary resource binaries.
- Build Gampo-owned sports icons, fixtures, teams, market labels, odds movement, and fake-credit bet simulation.
- No deposits, withdrawals, real-money wagering, provider RGS, or live Stake integration.

## Primary Screenshot References

Use these first when benchmarking the Gampo sportsbook UI:

- Desktop home: `screenshots\01-sports-home\00-default-loaded.png`
- Desktop search: `screenshots\01-sports-home\02-search-overlay.png`
- Desktop selected betslip: `screenshots\01-sports-home\03-betslip-selection.png`
- Live page: `screenshots\02-live-events-62\00-default-loaded.png`
- Horse racing event + betslip: `screenshots\event-01-bet-now\03-betslip-selection.png`
- League/event detail examples:
  - `screenshots\event-03-bet-now\00-supplement-default.png`
  - `screenshots\event-04-bet-now\00-supplement-default.png`
  - `screenshots\event-05-bet-now\00-supplement-default.png`
  - `screenshots\event-06-view-matches\00-supplement-default.png`
- Clean mobile home: `screenshots\mobile\02-mobile-clean-home.png`
- Clean mobile search: `screenshots\mobile\03-mobile-clean-search.png`

Context-only references:

- `00-mobile-home.png` and `01-mobile-search.png` show a betslip settings overlay accidentally left open. Use them only for betslip settings/modal behavior, not as the default mobile state.
- Supplement screenshots are valid when the note says they filled missing/default captures.

## Current Gampo Sportsbook State

Current implementation:

- Main page: `D:\gampo\src\pages\SportsPage.jsx`
- API service: `D:\gampo\src\services\sportsApi.js`
- Styling: `D:\gampo\src\styles\sports.css`
- Route: `/sports` from `D:\gampo\src\App.jsx`
- Existing docs: `D:\gampo\docs\games\sportsbook.md`

Current strengths:

- Fake-credit settlement already exists.
- The Odds API and TheSportsDB adapters already exist with caching and key rotation.
- Synthetic fallback fixtures already exist.
- Singles, parlay, and 2-of-N system tickets exist.
- Basic odds drift indicators exist after refresh.
- Practice-credit balance integration exists through `useCredits`.

Current gaps versus the audit:

- Layout is still a lab page with top tabs and a two-column content/slip structure. Stake reference uses a dense sportsbook shell: left sport rail, center market surface, right betslip.
- No true sportsbook home with promo/top-match shelves, sport rail hierarchy, top-sports shortcuts, popular events, and compact event cards.
- No event-detail route with breadcrumb, sport/region/league tabs, market accordions, display/market filters, and stacked markets.
- No global sportsbook search overlay with sport selector, query input, live result rows, and mobile full-screen behavior.
- Betslip is a practice ticket, not a transactional side rail with empty/selected/multi/single/settings/odds-change/disabled-submit states.
- Mobile layout does not match the captured bottom-nav + condensed event list + overlay search/betslip pattern.
- Current market cards are too large and educational; the target sportsbook surface should be denser, with math education available in tooltips/drawers rather than dominating every row.

## Product Target

Build a Gampo-owned sportsbook that feels structurally close to the captured Stake sportsbook while remaining educational and fake-credit only.

Target user flow:

1. Open `/sports`.
2. See a dense sports home with left rail, top promotions/info cards, search, top matches, popular events, and right betslip on desktop.
3. Select sport or live/upcoming filters from the left rail.
4. Click an event row or league tile to open an event detail view.
5. Expand market groups, select odds, and see the betslip update immediately.
6. Enter fake stake, see estimated payout, warnings, and simulated accept/reject/settlement states.
7. On mobile, browse via bottom nav, use full-width cards, and open betslip/search as overlays.

Keep the visible wording focused on sportsbook usage, not a lesson page. Educational content can sit in secondary chips, info drawers, EV hints, or post-settlement summaries.

## Recommended Architecture

Refactor the sportsbook into a small feature folder instead of growing `SportsPage.jsx` further.

Suggested structure:

```text
D:\gampo\src\sportsbook\
  sportsbookData.js          # synthetic owned fixtures, leagues, teams, sports, market configs
  sportsbookTypes.js         # documented shapes or JSDoc typedefs
  sportsbookMath.js          # implied probability, overround, de-vig, parlay/system math, cashout offer
  sportsbookFeed.js          # adapter that merges The Odds API data with synthetic Gampo feed
  sportsbookState.js         # reducers/helpers for selections, betslip, odds movement, settlement
  components\
    SportsbookShell.jsx
    SportsRail.jsx
    SportsHome.jsx
    PromoStrip.jsx
    TopMatchCard.jsx
    EventList.jsx
    EventRow.jsx
    EventDetail.jsx
    MarketGroup.jsx
    OddsButton.jsx
    BetSlip.jsx
    BetSlipSettings.jsx
    SearchOverlay.jsx
    MobileSportsNav.jsx
    MyBetsPanel.jsx
D:\gampo\src\styles\sportsbook.css
```

Keep `D:\gampo\src\pages\SportsPage.jsx` as a thin route wrapper that loads `SportsbookShell`.

## Data Model

Normalize all sources into one model before rendering.

```js
Sport {
  id, label, icon, liveCount, sortOrder, groups
}

League {
  id, sportId, region, country, label, liveCount, eventCount
}

Event {
  id, sportId, leagueId, region, startsAt, status,
  clock, period, home, away, participants,
  score, liveStats, popularity, tags, marketGroups
}

MarketGroup {
  id, label, displayMode, collapsed, selections
}

Selection {
  id, eventId, marketId, label, side, decimalOdds,
  previousOdds, suspended, boosted, trueProbability, source
}

BetSlipSelection {
  selectionId, eventId, marketId, acceptedOdds, currentOdds,
  stake, status, oddsChanged
}

Ticket {
  id, mode, status, selections, stake, totalOdds,
  estimatedPayout, acceptedAt, settledAt, result, profit
}
```

Required event statuses:

- `prematch`
- `live`
- `suspended`
- `settled`
- `cancelled`

Required selection statuses:

- `available`
- `selected`
- `suspended`
- `odds-up`
- `odds-down`
- `locked`

Required betslip statuses:

- `empty`
- `selected`
- `needs-stake`
- `ready`
- `odds-changed`
- `placing`
- `accepted`
- `rejected`
- `settled`

## Visual System From Audit

Desktop shell:

- Top product shell remains Gampo-branded, not Stake-branded.
- Left sport rail around 244-260px wide, dark navy panel, 48px rows, sport icons, live-count pills, collapsible all-sports/all-esports/all-racing groups.
- Center content starts around x=300 in the reference, with dense rows and shelves rather than large educational cards.
- Right betslip rail around 350px wide, sticky/fixed, dark panel, selection count badge, settings icon, close/collapse behavior.
- Use 8px or smaller radii for cards and buttons.
- Avoid large marketing hero sections. Sportsbook should feel like an operational betting interface.

Color and spacing direction:

- Base: dark blue-green/navy panels.
- Accent: Gampo green/blue for active tabs and odds selections.
- Live: red/pink badge for `Live`.
- Warning: yellow for odds change, same-game correlation, or suspended market notices.
- Odds cells: dark button, compact label, blue odds value, active state with stronger border/background.

Typography direction:

- Compact labels, strong readable odds, no oversized hero headings inside the sportsbook.
- Event row labels should be scannable: league/date/time/team names first, math only secondary.

## Core UI Components

### SportsbookShell

Responsibilities:

- Own desktop three-column layout and mobile single-column layout.
- Holds active route state: home, sport, league, event, search, my bets.
- Composes `SportsRail`, center surface, and `BetSlip`.
- Ensures page does not horizontally overflow at 1440x900 or 390x844.

### SportsRail

Match references:

- `screenshots\01-sports-home\00-default-loaded.png`
- `notes\01-sports-home.md`

Must include:

- Live Events with count.
- Starting Soon.
- All.
- My Bets.
- Top Sports: Soccer, Tennis, Cricket, Basketball, Ice Hockey, Baseball, Dota 2, Horse Racing, CS2, League of Legends.
- Collapsible groups for All Sports / All Esports / All Racing.
- Active row, hover row, live-count pill, and compact icon.

### SportsHome

Match references:

- `screenshots\01-sports-home\00-default-loaded.png`
- `screenshots\01-sports-home\99-full-page.png`

Must include:

- Three compact promo/info cards at top. Use Gampo-owned copy/art: e.g. Practice Shield, French Open Practice, Race Day Boost.
- Search input: `Search your game or event`.
- Segmented subnav: Sports Home, Live Betting, My Bets, Starting Soon.
- Top Matches carousel/grid with 3 cards across desktop.
- World Cup/future outrights grid.
- Top Sports and Popular Events shelves.

### EventList and EventRow

Match references:

- `screenshots\02-live-events-62\00-default-loaded.png`
- `screenshots\04-basketball\00-supplement-default.png`
- `screenshots\event-05-bet-now\00-supplement-default.png`

Must include:

- League/date group headers.
- Event rows with time, live indicators, small media/stat icons, home/away names, score/clock when live.
- Market label over odds cells, e.g. `Winner`, `1x2`, `Total`, `Spread`.
- `+N` market affordance to open event detail.
- Suspended/locked state for odds cells.
- Odds movement flash on value changes.

### EventDetail

Match references:

- `screenshots\event-01-bet-now\03-betslip-selection.png`
- `screenshots\event-03-bet-now\00-supplement-default.png`
- `screenshots\event-06-view-matches\00-supplement-default.png`

Must include:

- Back button and breadcrumb: sport > region > league/event.
- Sport-specific tabs where useful:
  - Racing: R1/R2/R3... style tabs.
  - League: Live & Upcoming / Outrights / All.
- Event meta row: time, date, stream/stat icons, competition.
- Market display filter: Standard / Compact, Market dropdown.
- Market accordions: Winner, Handicap, Total, Both Teams To Score, Correct Score, Player Props, Outrights.
- Selection rows with label left and odds button right.
- Optional `Advanced Stats` button with Gampo-owned stats panel.

### OddsButton

Required behavior:

- Idle: dark cell, label + decimal odds.
- Hover: slightly lifted or brighter border.
- Selected: blue/green active background and selected border.
- Suspended: disabled, muted, lock/label.
- Odds up/down: flash green/red or show small arrow for 1.2-1.4s.
- Changed while in betslip: mark the betslip row and require accept-any/accept-higher/no-change setting.

### BetSlip

Match references:

- `screenshots\01-sports-home\03-betslip-selection.png`
- `screenshots\event-01-bet-now\03-betslip-selection.png`
- `screenshots\event-05-bet-now\00-supplement-default.png`
- Context-only mobile settings: `screenshots\mobile\00-mobile-home.png`

Desktop requirements:

- Header: Bet Slip, selection count badge, expand/collapse caret, settings, close.
- Empty state with short prompt.
- Single Bet section.
- Multi Bet section when two or more selections exist.
- Selection rows: league/event, market label, selected outcome, odds, remove button.
- Stake input per selection or total stake depending mode.
- Estimated payout.
- Total stake and total estimated payout footer.
- Clear Bet(s) and Place Bet buttons.
- Place button disabled when no stake, suspended selection, or odds not accepted.
- Settings modal/drawer:
  - Multis First / Singles First.
  - Accept Any Odds / Accept Only Higher Odds / No Odds Changes Accepted.

Important: Gampo should not have a real Place Bet flow. The button should simulate ticket acceptance against practice credits and clearly remain fake-credit.

### SearchOverlay

Match references:

- `screenshots\01-sports-home\02-search-overlay.png`
- `screenshots\mobile\03-mobile-clean-search.png`

Requirements:

- Desktop: search field expands into a discovery panel or overlay.
- Mobile: full-width top search overlay with category dropdown, query, close button.
- Results grouped by sport/league and show live clock, team names, score, and odds cells when available.
- Query examples: soccer, Liverpool, NBA, racing.
- Results click opens event detail, not an external site.

### MobileSportsNav

Match references:

- `screenshots\mobile\02-mobile-clean-home.png`
- `screenshots\mobile\03-mobile-clean-search.png`

Requirements:

- Bottom nav: Browse, Casino, Bet Slip, Sports, Chat or Gampo equivalents.
- Sports home uses horizontal promo cards, search input, segmented nav, single-column top match cards.
- Bet slip opens as a bottom sheet/full-height overlay.
- Search opens as a full-screen overlay.
- Keep all buttons and odds cells tappable at mobile sizes.

## Motion And Interaction

Recommended motion:

- Page route/content changes: 120-180ms fade/slide.
- Odds up/down flash: 1.2-1.4s, border + subtle background flash.
- Bet selection: instant button state change plus 120ms betslip row insert.
- Betslip open/close mobile: 180-240ms bottom-sheet slide.
- Market accordion: 160ms height/opacity transition.
- Place fake ticket: 400-800ms accepted/rejected simulation delay.
- Settlement result: compact toast and ticket history update.

Respect reduced motion:

- Disable continuous animations and replace with static state changes when `prefers-reduced-motion` is active.

## Fake-Credit Sportsbook Logic

Keep settlement deterministic or seeded where practical. Avoid `Math.random()` for final ticket settlement in new work.

Implementation target:

- Use existing `createSeededRandom` or `nextRoll` style helper if available.
- Settle based on `trueProbability` and ticket seed.
- Store accepted odds on the ticket so later odds movement does not rewrite accepted tickets.
- Simulate odds drift every 20-45 seconds for synthetic fixtures.
- Simulate live clock/score changes for a small set of in-play fixtures.
- Generate market suspension periods to test disabled odds states.

Ticket modes:

- Singles: each selected outcome has its own stake and estimated payout.
- Multi/Parlay: one total stake, multiplied odds, all legs must win.
- System 2-of-N: preserve current educational system mode, but place it behind a mode tab or advanced drawer.
- Same Game Multi: allow in fake-credit mode but show correlation warning.

Validation:

- Stake must be `> 0`.
- Stake must not exceed practice balance.
- Suspended selections block placement.
- Odds-changed selections require settings behavior:
  - Accept Any Odds: proceed.
  - Accept Only Higher Odds: proceed only if all changed odds improved.
  - No Odds Changes Accepted: require manual accept/update.

## Resource Plan

Use clone-owned resources:

- Existing generated Gampo sports/promo assets under `D:\gampo\public\assets\games\promo\` and sports/crest assets if available.
- New generated icons/crests may be added through the existing Gampo asset pipeline.
- Sport icons can use `lucide-react` where suitable.

Do not use:

- Stake logos.
- Stake `S` icon.
- Stake promo images.
- Stake team crests or CDN artwork.
- Captured asset binaries.

If using the audit inventory, use it only for:

- Asset dimensions.
- Resource role.
- Load behavior.
- Visual density and placement.

## Implementation Phases

### Phase 1 - Shell Parity

Goal: make `/sports` structurally match the audit.

Tasks:

- Create sportsbook feature folder and move logic out of `SportsPage.jsx`.
- Build desktop three-column shell.
- Add left sport rail.
- Add right betslip rail.
- Convert current fixture cards into compact event rows.
- Keep existing fake-credit selection and settlement working.

Acceptance:

- `/sports` at 1440x900 shows sport rail, center home/event list, and betslip rail without horizontal overflow.
- Existing tests still pass.
- No real-money language beyond fake/practice context.

### Phase 2 - Home, Search, Mobile

Goal: match the sportsbook home and mobile surfaces from the audit.

Tasks:

- Add promo/info strip.
- Add search overlay.
- Add top matches, popular events, top sports shelves.
- Add clean mobile home and mobile search/betslip overlays.

Acceptance:

- Desktop screenshots compare well against `01-sports-home`.
- Mobile screenshots compare against `02-mobile-clean-home.png` and `03-mobile-clean-search.png`.
- Search results are local/synthetic or normalized from current API data.

### Phase 3 - Event Detail And Markets

Goal: make event detail pages feel like a sportsbook, not a fixture list.

Tasks:

- Add event route/state.
- Add breadcrumbs, league tabs, display/market filters.
- Add market accordions.
- Add extra synthetic markets: total, handicap/spread, both teams to score, correct score, player props, outrights.
- Add racing-specific race tab layout if time permits.

Acceptance:

- Event detail screenshots compare against `event-01`, `event-03`, `event-05`, and `event-06` references.
- Selecting odds from event detail mutates the shared betslip instantly.

### Phase 4 - Live Simulation And Ticket States

Goal: make the sportsbook feel alive.

Tasks:

- Add simulated live clock, score, possession/status text.
- Add odds drift timer and suspended odds intervals.
- Add odds-changed betslip state and settings behavior.
- Add fake ticket acceptance/rejection and settled ticket cards.
- Add optional cashout offer for accepted live tickets.

Acceptance:

- Odds movement is observable without clicking refresh.
- Betslip supports empty, selected, odds-changed, ready, placing, accepted, rejected, and settled states.
- Settlement is deterministic enough for tests.

## Files To Touch First

Start here:

- `D:\gampo\src\pages\SportsPage.jsx`
- `D:\gampo\src\styles\sports.css`
- `D:\gampo\src\services\sportsApi.js`
- `D:\gampo\src\utils\simulationMath.js`
- `D:\gampo\src\utils\sportsApi.test.js`
- `D:\gampo\docs\games\sportsbook.md`

Add new tests once logic is extracted:

- `D:\gampo\src\sportsbook\sportsbookMath.test.js`
- `D:\gampo\src\sportsbook\sportsbookState.test.js`

## Benchmark Checklist

For each implementation pass, capture local screenshots and compare:

- Desktop home idle.
- Desktop search overlay.
- Desktop selected single bet.
- Desktop multi bet with two selections.
- Desktop event detail with expanded market group.
- Desktop odds changed/suspended state.
- Mobile clean home.
- Mobile search.
- Mobile betslip bottom sheet.

Run:

```powershell
cd D:\gampo
npm run build
npm test
```

If browser verification is available, run `/sports` at:

- `1440x900`
- `390x844`

Visual requirements:

- No text overlap.
- No horizontal overflow.
- No nested card-heavy landing-page layout.
- Odds cells remain readable.
- Bet slip footer buttons stay visible.
- Mobile bottom nav does not cover primary actions.

## Prompt For Next AI

```text
You are improving only the Gampo sportsbook experience.

Use this audit root:
D:\gampo\rainbetclone\stake-sportsbook-audit-2026-05-24\

Primary references:
- Desktop home: screenshots\01-sports-home\00-default-loaded.png
- Search: screenshots\01-sports-home\02-search-overlay.png
- Desktop betslip selected state: screenshots\01-sports-home\03-betslip-selection.png
- Live/sport list: screenshots\02-live-events-62\00-default-loaded.png
- Event detail + betslip: screenshots\event-01-bet-now\03-betslip-selection.png
- League detail examples: event-03, event-04, event-05, event-06 supplement default screenshots
- Mobile clean home/search: screenshots\mobile\02-mobile-clean-home.png and screenshots\mobile\03-mobile-clean-search.png

Do not use Stake source, CSS, JS, SVG paths, icons, images, team crests, CDN resources, or proprietary assets. Use screenshots and notes only as structural/behavior reference. Build Gampo-owned sports icons, fake fixtures, market data, and practice-credit betting behavior.

Current app:
- D:\gampo\src\pages\SportsPage.jsx
- D:\gampo\src\services\sportsApi.js
- D:\gampo\src\styles\sports.css
- D:\gampo\docs\games\sportsbook.md

Goal:
Refactor /sports from a lab-style page into a dense sportsbook shell inspired by the audit:
1. Desktop three-column layout: left sport rail, center sportsbook home/event/market content, right betslip rail.
2. Sports home with promo cards, search, top matches, popular events, top sports, and live/upcoming segmentation.
3. Event detail view with breadcrumbs, market filters, market accordions, odds buttons, and representative sport-specific layouts.
4. Betslip with empty, selected, single, multi, odds-changed, settings, placing, accepted, rejected, and settled states.
5. Mobile sportsbook with bottom nav, clean home, full-screen search, and betslip overlay.
6. Fake-credit-only settlement using deterministic/seeded simulation. No real-money wagering.
7. Keep The Odds API/TheSportsDB optional; always support synthetic Gampo-owned fallback data.

Acceptance:
- npm run build passes.
- npm test passes or any pre-existing failures are documented.
- /sports works at 1440x900 and 390x844.
- Screenshots show desktop home, selected betslip, event detail, mobile home, and mobile search.
- No copied Stake/provider assets/source are introduced.
```

## Non-Goals

- Do not implement casino/slot/originals changes in this pass.
- Do not integrate Stake.
- Do not add deposits, withdrawals, crypto wallets, real order submission, KYC, or production wagering.
- Do not prioritize educational charts over sportsbook usability; keep education secondary and contextual.

