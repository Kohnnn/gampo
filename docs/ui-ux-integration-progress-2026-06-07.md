# UI/UX Integration Progress - 2026-06-07

## Goal

Integrate the parallel desktop/mobile UI/UX work without clobbering it, then harden it with measurable layout contracts and production verification.

## Plan

1. Review the uncommitted WIP and classify useful instrumentation/layout changes versus risky behavior changes.
2. Keep the existing casino visual language: dark dense surfaces, green primary actions, game-specific accents, and mobile-first fixed action docks.
3. Add shared UX hooks so browser smoke can score visible surfaces, primary actions, scroll reachability, and mobile action hit tests across pages.
4. Tokenize overlay layers so mobile nav, mobile action docks, sheets, modals, and toasts have predictable stacking order.
5. Tighten cases desktop/mobile layout where the shared game shell was not optimal.
6. Validate with focused layout tests, full test suite, browser smoke, build, deploy, and live asset verification.

## Accepted WIP

- `data-ux-surface` markers were accepted for app shell, game shell, casino pages, collections, sportsbook, docks, controls, stages, asides, cards, and toasts.
- `data-ux-primary-action` markers were accepted for shared bet CTAs, slot spin CTAs, poker actions, sportsbook bet slip actions, case opening, casino page CTAs, and collection open links.
- `scripts/browserSmoke.mjs` now supports `--mode=ux`, writes `output/ux-benchmark`, and records UX score, surface coverage, scroll reachability, playfield priority, hit-test status, screenshots, and failures.
- Global z-index tokens were accepted: `--z-shell`, `--z-search`, `--z-dock`, `--z-mobile-nav`, `--z-mobile-action`, `--z-mobile-sheet`, `--z-modal`, and `--z-toast`.
- Mobile play-surface header compression was accepted to reduce top chrome on game pages.
- Casino card focus states and action hover/disabled treatments were accepted for clearer desktop keyboard/tap affordance.

## Optimizations Added

- Browser smoke now targets the real sportsbook shell selectors: `.sb-page` and `.sb-main` instead of the stale `.sportsbook-shell` name.
- Mobile interaction fallback now includes `[data-ux-primary-action]`, so benchmark clicks still work when a game uses the new generic primary-action hook rather than older route-specific selectors.
- Slot mobile interaction detection now checks for `[data-slot-mobile-dock]` on the page, so slot templates beyond `/slots` can share the same smoke path.
- Big-win overlays, game tool popovers, odds popups, fairness drawers, hotkey modals, BetPanel mobile sheets, and action docks now use the shared z-index token scale.
- Cases desktop layout now keeps a deliberate three-pane shell above `1181px`: left controls, center stage, right command/stat rail.
- Cases mobile command panel stays compact and keeps the open CTA at a minimum `48px` tap target.
- Promotion CTAs were marked as UX primary actions so benchmark mode does not miss valid page actions.
- Layout contract coverage was extended for z-index tokens, sportsbook selectors, generic primary-action fallback, slot dock detection, and cases three-pane behavior.

## Risks Watched

- Overlay token changes can hide mobile docks if a modal token is too low. The accepted order is mobile nav `<` mobile action `<` mobile sheet `<` modal `<` toast.
- `data-ux-primary-action` can over-count page actions if placed on secondary controls. Accepted placements are primary CTAs or route-critical actions only.
- Cases-specific desktop overrides use `:has()`. This app targets modern browsers, and the same selector was already used elsewhere in the cases CSS.
- UX score is a benchmark, not a release gate by itself. Release failure gates remain overflow, blocking loaders, broken images, console/runtime errors, missing key actions, blocked mobile actions, and failed interaction contracts.

## Progress

- Completed: reviewed the 33-file WIP and kept the coherent UX instrumentation/refactor.
- Completed: optimized browser smoke selectors and mobile primary-action handling.
- Completed: aligned overlay, modal, sheet, dock, and toast z-index layers with global tokens.
- Completed: improved cases desktop three-pane behavior and compact mobile command layout.
- Completed: added focused contract coverage for the accepted integration.
- Completed: deployed to production and verified the live asset matches the local build.

## Validation Commands

- `rtk vitest src/components/games/primitives/qaLayout.contract.test.js src/components/PokerGame/PokerGameCss.test.js`
- `rtk vitest`
- `node scripts/browserSmoke.mjs --baseUrl=https://gampo-educational-simulator.netlify.app --routes=/,/originals,/slots-lobby,/poker,/cases,/sportsbook,/dice,/gummy-drops --viewports=390x844,492x820,1365x768`
- `npm run ux:benchmark -- --baseUrl=https://gampo-educational-simulator.netlify.app --routes=/,/originals,/slots-lobby,/poker,/cases,/sportsbook,/dice,/gummy-drops --viewports=390x844,492x820,1365x768`
- `rtk npm run build`
- `rtk npx netlify deploy --prod --dir=dist`

## Production Verification

Live URL: `https://gampo-educational-simulator.netlify.app`

Deploy ID: `6a254ce9c435034253171dc3`

Verified production asset: `assets/index-BBpZuKCJ.js`

Completed validation:

- `rtk vitest src/components/games/primitives/qaLayout.contract.test.js src/components/PokerGame/PokerGameCss.test.js` -> `PASS (14) FAIL (0)`
- `rtk vitest` -> `PASS (283) FAIL (0)`
- `rtk npm run build` -> passed
- local browser smoke against `http://127.0.0.1:4173` -> passed
- local UX benchmark against `http://127.0.0.1:4173` -> passed with `ux=100` on sampled routes
- `rtk npx netlify deploy --prod --dir=dist` -> live
- live asset comparison -> `MATCH - UI/UX integration live (assets/index-BBpZuKCJ.js)`
- production browser smoke -> passed on `390x844`, `492x820`, and `1365x768`
- production UX benchmark -> passed with `ux=100` on all sampled routes
