# GamPo v4 — Full QA Evaluation Report

**Date:** 2026-05-21 18:00 +07 | **Tester:** AI QA Agent | **URL:** `https://vdklbvkzbd1g.share.zrok.io/`

***

## OVERALL VERDICT: NEAR-PRODUCTION QUALITY — FEW REMAINING ISSUES

This is the best build by far. All prior P0 crashes are resolved, Baccarat road maps are fixed, Stats/PnL panel is a great new feature, and the homepage is a fully featured lobby. Remaining issues are mostly one persistent visual placeholder (Sic Bo dice), one broken lobby link, and minor UX polish items.

***

## 1. WHAT'S NEWLY FIXED vs v3

| Item | Status |
|---|---|
| Casino War blank screen crash | ✅ FIXED — routes to `/war`, cards deal correctly  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/war) |
| Color Pick blank screen crash | ✅ FIXED — routes to `/color`, beautiful color wheel UI  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/color) |
| Baccarat road maps empty | ✅ FIXED — Big Road + Big Eye Boy + Small Road + Cockroach Pig all populated  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/baccarat) |
| Mines grid too small | ✅ FIXED — proper full-size 5×5 grid with visible cells  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/mines) |
| Stats/PnL overlay panel | ✅ NEW — SESSION/GAME/ALL-TIME tabs, Profit History chart renders  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/plinko) |
| Profit History chart | ✅ WORKS with session data (red line chart visible)  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/plinko) |
| Hi-Lo Cards route | ✅ EXISTS at `/hilo` — card shows "7", Higher/Lower selector works  [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/hilo) |

***

## 2. REMAINING BUGS

### 2a. Sic Bo — Dice Faces Still "?" Placeholders

**Severity: P1 — Still unresolved across all builds** [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/sicbo)

- All 3 dice show white square "?" icons regardless of roll state
- The Total shows correctly (e.g., "6") but no visual dice face renders
- The comprehensive betting table is excellent ✅
- **Fix:** Create a `<DiceFace value={n} />` component rendering CSS pip dots, or use Unicode die chars (⚀⚁⚂⚃⚄⚅) mapped to 1–6. Wire to `diceResults[0..2]` game state.

### 2b. Dice — 4 White Pill Placeholder Boxes

**Severity: P2 — Persistent across all builds** [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/dice)

- Four blank white rounded-rectangle pills float above the probability slider
- Appear to be "last 4 results" history chips — never populated even after rolls
- **Fix:** Either: (a) populate with last-4-roll result values as colored chips (green/red for win/loss), or (b) hide with `v-if="rollHistory.length > 0"` until first roll.

### 2c. Hi-Lo Cards — Broken Lobby Card Link

**Severity: P2**

- Lobby game card for "Hi-Lo Cards" links to `/hilocards` → renders graceful 404 "Game not found" page
- Actual working route is `/hilo`
- **Fix:** Update the lobby card `href` and any internal links from `/hilocards` to `/hilo`. Optionally add a `/hilocards` redirect to `/hilo` in the router.

### 2d. Stats Tab Click Not Toggling in Overlay (Without Session Data)

**Severity: P2** [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/baccarat)

- Clicking the "Stats" tab label in the Chat/Race/Stats overlay header does NOT switch panel content when starting fresh on a page with no session data
- The `PnL_Stats` sidebar button correctly opens the Stats view ✅
- When session data exists (Tab B), the Stats tab switch works correctly ✅ [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/plinko)
- **Fix:** The Stats tab click handler likely has a guard that prevents switching when `sessionData` is empty. Remove the guard or show a "No session data yet — play a round to see stats" empty state instead of silently blocking the tab switch.

### 2e. Color Pick / RPS — Decorative Background Bleeds Outside Game Panel

**Severity: P3** [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/color)

- The crypto/dice/card decorative art texture slightly bleeds beyond the `.game-canvas` container boundary on left and right sides
- Visible as a ~15px strip of decorative pattern alongside the sidebar and right stats panel
- **Fix:** Add `overflow: hidden` on the game wrapper container, or scope the background to `position: absolute; inset: 0` within the game panel only.

### 2f. Dice — "TABLE MATH" Category Label Styling

**Severity: P4** [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/dice)

- Category badge under page title shows "TABLE MATH" — inconsistently styled compared to other games (ARCADE ORIGINALS, CARD ROOM, DICE TABLE). "TABLE MATH" is not a recognised category used elsewhere. Verify this is intentional.

***

## 3. FULL GAME STATUS TABLE v4

| Game | Route | Card Faces | Visuals | BetPanel | Overall |
|---|---|---|---|---|---|
| Crash | `/crash` | N/A | ✅ Chart renders | ✅ | ✅ Excellent |
| Plinko | `/plinko` | N/A | ✅ Peg board, buckets | ✅ | ✅ Excellent |
| Dino Run | `/dino` | N/A | ✅ Pixel dino + cacti | ✅ | ✅ Good |
| Mines | `/mines` | N/A | ✅ Full 5×5 grid | ✅ | ✅ Fixed |
| Dice | `/dice` | N/A | ⚠️ 4 empty white pills | ✅ | ⚠️ P2 |
| Limbo | `/limbo` | N/A | ✅ Rainbow sphere | ✅ | ✅ Good |
| Keno | `/keno` | N/A | ✅ 80-ball grid | ✅ | ✅ Good |
| Wheel | `/wheel` | N/A | ⚠️ Segment labels tiny | ✅ | ⚠️ P3 |
| Roulette | `/roulette` | N/A | ✅ Wheel contained | ✅ | ✅ Excellent |
| Blackjack | `/blackjack` | ✅ Renders on deal | ✅ Felt table | ✅ | ✅ Excellent |
| Baccarat | `/baccarat` | ✅ Backs pre-deal | ✅ Road maps live | ✅ | ✅ Excellent |
| Casino War | `/war` | ✅ Renders on deal | ✅ VS layout | ✅ | ✅ Fixed |
| Sic Bo | `/sicbo` | N/A | ❌ Dice "?" placeholders | ✅ | ❌ P1 |
| Video Poker | `/videopoker` | ✅ Renders on deal | ✅ Pay table | ✅ | ✅ Excellent |
| Color Pick | `/color` | N/A | ✅ Color wheel | ✅ | ✅ Fixed |
| Tower | `/tower` | N/A | ✅ Grid rows clear | ✅ | ✅ Good |
| Chicken Cross | `/chickencross` | N/A | ✅ No overflow | ✅ | ✅ Good |
| Lottery | `/lottery` | N/A | ✅ Animated balls | ✅ | ✅ Excellent |
| Slots | `/slots` | N/A | ✅ Real symbols 5×3 | ✅ | ✅ Excellent |
| Coin Flip | `/coinflip` | N/A | ✅ Gold coin clean | ✅ | ✅ Excellent |
| RPS | `/rps` | N/A | ⚠️ Bg slight bleed | ✅ | ⚠️ P3 |
| Hi-Lo Cards | `/hilo` | ✅ Card "7" renders | ✅ Higher/Lower | ✅ | ✅ Good |

***

## 4. NEW FEATURES AUDIT

### PnL Stats Panel [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/plinko)

- ✅ Opened via `PnL_Stats` sidebar button
- ✅ Three tabs: SESSION / GAME / ALL-TIME — all clickable
- ✅ Profit (+GC), Wins, Losses counters update live
- ✅ Profit History line chart renders with session data
- ✅ Wagered / Rounds / Scope (Session) shown at bottom
- ✅ "Reset Session" button present
- ⚠️ **Profit History empty state** — when no data, chart area is a blank white box with no message. Should show "Play rounds to see your profit history" or a flat baseline chart
- ⚠️ **GAME tab** — shows game-specific stats but "No data" message style is very sparse; could show per-game breakdown cards

### Chat / Race / Stats Overlay [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/baccarat)

- ✅ Chat tab — live simulated messages scrolling, SIMULATED disclaimer banner ✅
- ✅ Race tab — leaderboard with colored avatar circles + badge labels ✅
- ✅ Stats tab — opens correctly via sidebar button; works correctly when session exists
- ⚠️ Stats tab click in overlay header doesn't switch when no session data (see Bug 2d)
- ⚠️ No unread message indicator on minimized bar
- ⚠️ Chat input "Type to simulate..." placeholder — the placeholder text is oddly phrased ("simulate" instead of "chat" or "message") — minor copy issue

### Homepage Lobby [vdklbvkzbd1g.share.zrok](https://vdklbvkzbd1g.share.zrok.io/)

- ✅ "Recently Played" section — dynamic based on activity ✅
- ✅ "Recommended Lessons" section ✅
- ✅ "Originals / Casino Tables / Slots / Arcade Classics" sections ✅
- ✅ All game thumbnails have real artwork ✅
- ✅ Filter tabs: All / Originals / Slots / Table / Arcade / Sports ✅
- ✅ Right column: Live Studio, Missions, Recent Activity widgets ✅
- ⚠️ **Dino Run thumbnail** has white/transparent checkered background artifact — PNG transparency not composited against card gradient
- ⚠️ **Sportsbook Lab** card still shows "Sp" text abbreviation in the Recommended section — no thumbnail artwork loaded for this card

***

## 5. MASTER ISSUE TRACKER v4

| # | Issue | Sev | Route |
|---|---|---|---|
| 1 | Sic Bo dice faces — "?" placeholder, never updates | P1 | /sicbo |
| 2 | Dice — 4 blank white pill history chips | P2 | /dice |
| 3 | Hi-Lo Cards lobby link broken (`/hilocards` → 404) | P2 | /hilo |
| 4 | Stats tab click doesn't switch when no session data | P2 | Global overlay |
| 5 | Color Pick / RPS decorative bg bleeds outside panel | P3 | /color /rps |
| 6 | Profit History chart empty state — blank box | P3 | Stats overlay |
| 7 | Dino Run lobby thumbnail — transparent bg artifact | P3 | / (lobby) |
| 8 | Sportsbook Lab lobby card — "Sp" text, no image | P3 | / (lobby) |
| 9 | Chat input placeholder copy: "Type to simulate..." | P4 | Global overlay |
| 10 | Wheel segment labels unreadable on wheel face | P4 | /wheel |
| 11 | Dice "TABLE MATH" category label inconsistency | P4 | /dice |

***

## 6. IMPROVEMENT & FEATURE IDEAS

### Immediate Fixes

1. **Sic Bo dice:** `<DiceFace :value="diceResults[i]" />` — render pip dots via CSS grid. Map 1=center, 2=top-right+bottom-left, etc. Until then, use `⚀⚁⚂⚃⚄⚅` as font characters keyed by result value.
2. **Dice pills:** Change `v-show` to `v-if="rollHistory.length > 0"` OR pre-fill with `?` chip styled in muted gray. On roll, push colored chip (green = win, red = loss) with the result number.
3. **Hi-Lo link:** Router: add `{ path: '/hilocards', redirect: '/hilo' }`. Update lobby card route.
4. **Stats tab guard:** Remove `if (!sessionData)` return on the Stats tab click handler; show empty state content instead.

### Polish

5. **Dino thumbnail PNG:** Export with `background: transparent` and ensure card CSS has `background: gradient` underneath — don't let the card's white fill bleed through.
2. **Sportsbook Lab card:** Add a thumbnail image asset (sports/odds themed gradient with ⚽ or 📊 icon overlay) to the game card definition.
3. **Color Pick / RPS bg bleed:** `overflow: hidden` on `.game-area-wrapper`, move background `::before` pseudo-element inside the game canvas div.
4. **Profit History empty state:** Show flat `y=0` dashed baseline with label "Your profit curve will appear here" in the empty chart.
5. **Chat input copy:** Change "Type to simulate..." to "Chat with the lab..." or just "Say something...".
6. **Wheel labels:** Render a "LAST: X" number badge in the wheel hub center after each spin.

### New Features

11. **Cross-session stats persistence** — Currently "Reset Session" clears ALL-TIME too. Consider localStorage persistence for ALL-TIME tab so stats survive page refresh.
2. **Game quick-launch from Stats panel** — In the GAME tab of Stats, show each game played as a row with a "▶ Play again" shortcut link.
3. **Sic Bo betting suggestions** — After each roll, highlight which bets would have won in a different accent color on the betting table.
4. **Auto-bet stop conditions UI** — Mines, Plinko, and Crash have stop-on-profit/loss fields that show "0 = off" — add cleaner number inputs with currency symbol prefix and live validation.
5. **Lobby search** — The search bar in the top header ("Search simulators") — verify it works with keyboard input; if not wired, add debounced filter across game names.
