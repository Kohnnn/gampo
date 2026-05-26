# Stake/Rainbet Wave 37 - Mobile and Tablet Refinements

Date: 2026-05-26

## Scope

Closed Gap 5 from `docs/codex-handoff-prompt.md`: the remaining narrow-screen layout issues now have explicit responsive behavior for slot bonus overlays, ChatDock tabs, cases Pokedex filters, and the game tools portal.

## What Changed

- `src/components/games/slots/slots.css`
  - Adds a final phone-safe override after later slot cosmetic layers so wheel and hold overlays shrink inside the reel frame at small widths.
  - The multiplier wheel disc uses a smaller phone size, tighter padding, and reduced label spacing.
  - The hold-and-respin overlay switches to a five-column board on phones so 15-cell boards fit inside the reel frame without cropping.

- `src/components/ChatDock.jsx`
  - Wraps tab labels in `.chat-dock-tab-label` spans and adds stable aria labels to all four tabs.
  - Keeps the required tab order: Stats / Progress / Chat / Race.

- `src/components/ChatDock.css`
  - Adds container-query and media-query fallbacks that hide tab labels when the dock is narrower than 360px.
  - Keeps the desktop locked-width behavior intact while allowing the existing mobile `calc(100vw - 16px)` dock width.

- `src/components/games/cases/CasesGame.jsx`
  - Centralizes rarity filter options and reuses them for both history and Pokedex filters.
  - Adds a compact rarity button group for narrow screens while preserving the native select on larger screens.

- `src/components/games/cases/cases.css`
  - Forces the Pokedex collection grid to two columns at 480px.
  - Hides only the rarity select at phone width and shows the new rarity button group; the sort select remains available.

- `src/components/games/primitives/primitives.css`
  - Keeps the GameToolbar popover portal-rendered.
  - Adds a `<480px` override that anchors the portalled menu to the viewport bottom-right instead of using the trigger-relative full-width mobile sheet.

## Verification

- Full suite:
  - `npm test -- --run`
  - Result: 143 tests across 30 files passed.
  - Note: npm still prints the existing `Unknown cli config "--run"` and `--localstorage-file` warnings.

- Production build:
  - `npm run build`
  - Result: built in 12.59s.
  - Existing warnings remain: empty `phaser` / `matter` chunks and large row chunks.

- Browser smoke:
  - Web-game Playwright client loaded `/slots` and produced `output\web-game-wave37-responsive\shot-0.png`; its fresh browser context still logs the known isolated `net::ERR_NETWORK_ACCESS_DENIED` resource denial.
  - `/slots` at 375x667: measured injected wheel and hold overlay fixtures inside `.slot-reel-frame-v2`; wheel and hold were both fully within the reel frame, with no horizontal overflow.
  - `/slots` at 375x667: opened the Game tools portal; computed popover was 230px wide with an 8px right gap and 14px bottom gap.
  - `/cases` at 480x844: Pokedex grid computed as two columns (`188px 188px`), rarity select hidden, rarity button group displayed, sort select still visible, and no horizontal overflow.
  - `/cases` at 320x667: ChatDock measured 304px wide and all four `.chat-dock-tab-label` elements computed to `display: none`.
  - Live browser console remained clean except for normal Vite and React dev messages.
  - Screenshots:
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779757520209\wave37-cases-pokedex-480.png`
    - `C:\Users\Admin\AppData\Local\Temp\playwright-mcp-output\1779757520209\wave37-chatdock-320.png`

## Notes

- No new images, new SVGs, 9router calls, SteamAnalyst calls, or provider/source assets were added.
- ChatDock desktop width remains locked at 400px, and its tab order remains Stats / Progress / Chat / Race.
- The GameToolbar popover still uses `createPortal`; only the small-phone anchor rule changed.
- Remaining handoff gap: per-game polish leftovers.
