# Stake/Rainbet Waves 21–30 — Master Plan (2026-05-24)

This plan covers the next 10 waves driven by these user asks:

1. Move provably-fair / hotkeys / odds out of the titlebar — make them real popouts (currently the Game Tools popover still sits inside the titlebar's flex/clip context).
2. Make every game fit a 1610×870 container — scroll or resize gracefully.
3. Deeper bonus features for slots: more animation, dotted-line win paths, theme SFX/BGM, more 16-bit SFX.
4. CS case opening that **feels** like a real CS case: anchor scale, particles, filters, sell, deeper sound.
5. Deeper progression: missions/promotions/VIP wired to live data, achievement+mission popups, reset progress, Progress tab next to Stats, dock no longer reposition on tab switch (current order: Chat / Race / Stats / Progress → new order: **Stats / Progress / Chat / Race**).
6. Better, distinct icons for slot + arcade items in the left sidebar.
7. SFX binaries (chiptune-style 16-bit feel).
8. Audit all games and brainstorm further polish.

Plus the late additions:
9. Adaptive **app sidebar that swaps between Games and Sports** context (sportsbook now has depth, including SportsRail with Live / Starting Soon / All / My Bets / Top Sports / All Sports / All Esports / All Racing).
10. **Pin games** to the sidebar.
11. **Multi-device** improvements (mobile / tablet / wide desktop).
12. **Smarter simulated players** in all games (chat variants, poker bot, race, crash crowd, etc.).

## Defaults (proceed unless overridden)

- D1: ChatDock tab order = **Stats / Progress / Chat / Race**.
- D2: ChatDock locked width = **400 px** (compromise between Stats 380 and Progress 420). On mobile (<= 760px) it stays full-viewport-minus-16px.
- D3: Game-tools popover = **portal-rendered fixed popup** anchored under the trigger (escapes titlebar, parity with Odds popup).
- D4: Layout fit strategy = **C / hybrid** — shrink chrome first, scroll if still over budget. `gs-playfield` already has `overflow-y: auto`; tighten game-internal padding/font, then rely on scroll.
- D5: CS case scope = **C** — polish + sell + cosmetic trade-up (math-neutral).
- D6: Per-skin BGM = **B** — per skin **family** (mythic / classic / cyber / wanted / olympus / bayou / mummy / phoenix / mansion / ronin / iron / coop / spirit / forge / gummy / rock / catcher / western / bank). 1 loop per family.
- D7: SFX/BGM binaries = **A** — generate procedural 16-bit-style WAVs at build time. Manifest stays the contract; binaries land in `public/audio/...`.
- D8: Sidebar icons = **B** — move icons into `src/data/sidebarIcons.jsx` for cleaner imports.
- D9: Wave order = 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30.

If any default needs changing the user can override before that wave starts.

## Wave 21 — Titlebar popout + ChatDock stable

- Convert `.gt-popover` to portal-rendered fixed popup so it visually escapes the titlebar.
- Add backdrop click-out + Escape handling (parity with Odds popup).
- ChatDock locks to 400px width across **all** tabs.
- Reorder tabs to **Stats / Progress / Chat / Race**.
- Fix close-out doc.

## Wave 22 — Adaptive sidebar (Games vs Sports)

- Detect route via `useLocation()`; sidebar swaps content:
  - On `/sports*`: shows Sportsbook nav (Live / Starting Soon / All / My Bets / Top Sports / All Sports / All Esports / All Racing / Outrights), search, league pinning.
  - Elsewhere: existing Casino / Progress / Account / Games sections.
- Mobile: sidebar collapses to icon-only or off-canvas drawer (already partially supported, needs polish).
- Mid-row Games/Sports switcher remains visible.

## Wave 23 — Pinned games + unique icons

- Pin/unpin button on each game item; persist to localStorage `gampo_pinned_games`.
- New top group "Pinned" appears above Featured when at least one entry exists.
- Move icons to `src/data/sidebarIcons.jsx`.
- Author 21 unique slot icons + 13 unique arcade icons.

## Wave 24 — 1610×870 fit + multi-device

- Audit each game route at exactly 1610×870.
- Target high-violation games first: Slots (megaways), Cases (post Wave 18), Poker, Crash, Roulette, Plinko.
- Add `data-fit="hybrid"` opt-in on `GameShell`; CSS shrinks paddings & font scale, then allows inner scroll.
- Mobile (≤480), tablet (481–760), small laptop (761–1280), 1610×870 sweet spot, wide (≥1600).
- Sticky bottom bet panel on landscape phone (already exists; verify it still works after layout changes).

## Wave 25 — Progression + Missions + Promotions + VIP

- New `useMissions` hook with daily/weekly/lifetime missions, persisted to localStorage.
- `useGameSession.record` mirrors to missions and progression.
- Re-skin `/missions` to render real progression data (claim button, progress bar).
- Re-skin `/promotions` to read from missions/promos data + active claim states.
- Re-skin `/vip` to show real wagered milestones from `useProgress`.
- Mission toast (parallel to AchievementToast).
- ChatDock Progress tab gains sub-tabs: Achievements / Missions / VIP / History.
- Reset Progress dialog supports per-scope reset: Achievements / Missions / VIP / Wallet.

## Wave 26 — CS case feel parity

- Reel anchor scale-up: prize tile scales 1 → 1.18 on settle, neighbors dim.
- Rare-drop particle burst when Covert+ rarity lands.
- Collection page filters: rarity dropdown + search by name + sort by recent/multiplier/count.
- **Sell mode**: convert a skin in collection to credits at its multiplier.
- **Trade-up**: select 5–10 same-tier skins, get one tier-up roll (cosmetic only — keeps math-neutral).
- Better SFX hooks (manifest already declared in Wave 18).
- Tier filter chips in History.

## Wave 27 — Slot bonus depth (paylines + BGM + SFX)

- SVG overlay layer on `.slot-reel-frame-v2`: draws **dotted-line win paths** through winning cells, animates draw-on, fades.
- Cluster/megaways → polyline through cell centers.
- Per-skin-family BGM declared in `bgmManifest.js`.
- More feature SFX: wheel landing, hold tile fill, sticky lock, mystery reveal, wanted slam.
- All audio honors master mute + reduced motion.

## Wave 28 — Simulated player depth

- Crash: simulated crowd grows to 12–18 players with personalities (greedy/cautious/whales) — already partially shipped.
- Plinko: ghost-ball strip with sim users.
- Mines / Limbo / Wheel: live recent-bets feed with sim users.
- Live Poker: bot AI upgrade — postflop bot reads texture + GTO confidence; bluff-frequency bumps; per-seat persona.
- Race: more frequent updates (already simulated, just deeper variance).
- ChatDock chat: more variant message templates (smack talk, sympathy, tilt, hype) + reactions.

## Wave 29 — 16-bit SFX + audio bus

- Audio bus: master / BGM / SFX gain nodes (independent).
- Volume sliders in `AudioToggle` popover (master / BGM / SFX).
- Persist volumes.
- Generate procedural 16-bit-style WAVs via `scripts/genSfx.mjs` (Web Audio offline render → WAV) for declared roles.

## Wave 30 — Per-game polish audit

- Crash multiplier pulse near 10×.
- Plinko ball pop SFX hookup.
- Mines hover lift + cashout climb feedback.
- Dino bird collision SFX.
- Tower tier reveal ladder.
- ChickenCross lane fade-in.
- Roulette pre-spin idle wheel motion + pocket sting.
- Blackjack hit/stand UX bigger.
- Baccarat road grid emphasis.
- VideoPoker hold pulse.
- Lottery final settle animation.
- Poker chip slide on bet.
- Hi-Lo / Coinflip / RPS / Guess / Color reveal SFX cluster.

## Status

- 2026-05-24: Master plan written. Starting Wave 21.
