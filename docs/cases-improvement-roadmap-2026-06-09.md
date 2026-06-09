# Cases Improvement Roadmap — 2026-06-09

Owner scope: `src/components/games/cases/**`, `src/hooks/useCaseCollection.js`, `src/hooks/useCsCollection.js`, `src/pages/CollectionsPage.{jsx,css}`, `public/data/cs-*.json` and the builder `scripts/buildCsCollection.mjs`.
Shared/read-only here: `src/utils/fairRng.js` (read its API, don't change), `EducationPanel.jsx`, `browserSmoke.mjs` (coordinate).

## Context
60 cases, one synchronous round build + timer-driven reel (`caseOpening.js`, `casesAnimation.js`). Recent UX shipped this session: reel-first reorder (`.cases-reel-area`), `useScrollActionIntoView`, sticky mobile open dock (`.cases-mobile-dock`), collapsible browser (`.cases-browser-toggle`), category-chip a11y. Strong inventory/pokedex. No selling/trading (intentional — keep).

## Gates (every ship must pass)
- `rtk vitest run` green; `rtk npm run build` OK
- `node scripts/browserSmoke.mjs --routes=/cases,/collections --viewports=390x844,466x704,492x820,1365x768` → 0 overflow / 0 errors; `/cases` interaction=passed
- ux=100 `/cases`; a11y PASS `/cases`+`/collections`; contrast AA PASS
- Deploy via `netlify deploy --prod --dir dist`; verify live asset hash == local.

## Tasks

### P0 — Educational mission (transparency)
- [ ] **C-P0-1 provably-fair panel**: `fairRng.js` already persists server/client seed + nonce + recent-roll log with real HMAC enrichment, but the Cases UI surfaces none of it. Add a "Fairness" panel (server-seed hash, editable client seed, current nonce, verify link) reading `getProvablyFair()`/`getRecentRolls()`. Add a per-drop nonce badge on result cards. NOTE: cases roll via the sync lightweight hash (`hmacRollSync`), not `nextRollAsync` — verify-flow wording must match what's actually computed (don't claim SHA-256 verification of the sync roll).
- [ ] **C-P0-2 real per-case EV into EducationPanel**: `CasesGame.jsx:1694` passes hardcoded `winProbability={0.32} payoutMultiplier={1.5}`. The component already computes per-case `evGc`/`volatility`/`openPriceGc`; feed real values so the EV coach reflects the actual case house edge.
- [ ] **C-P0-3 item drop-odds table**: weights exist in code (`rarityWeight`) but are never shown. Add a per-rarity drop-% table in the case peek/preview (Mil-Spec 78.92% / Restricted 15.98% / Classified 3.20% / Covert 0.64% / rare tiers 0.26% / special 0.4%) derived from the single source (see C-P1-1).

### P1 — Correctness & flow
- [ ] **C-P1-1 dedupe rarity weights**: `caseOpening.rarityWeight` (:22) and `caseEconomy.rarityDropWeight` (:88) are byte-identical — two sources of truth for odds. Collapse to one exported table; both EV and rolls import it. (Unblocks C-P0-3 being accurate.)
- [ ] **C-P1-2 default browser collapsed after selection**: `browserCollapsed` defaults `false` (:528) so first paint is still long. Default collapsed once a case is selected (keep open while choosing).
- [ ] **C-P1-3 shared filter state leak**: History and Pokedex both read `rarityFilter` (:919/:928) → filtering one leaks into the other. Split into per-view state.

### P2 — Polish & content
- [ ] **C-P2-1 delete dead CSS**: `.cases-sell-btn` (+hover), `.cases-view-tabs`, `.cases-tier-chip` are unused (no JSX). Remove.
- [ ] **C-P2-2 cold-load skeleton**: stage shows placeholder "Loading case" + default 5-credit before manifest resolves; 60-card grid reflows as lazy images arrive (no width/height). Add a skeleton + fixed image dims.
- [ ] **C-P2-3 per-case stats**: open count, luckiest drop, total wagered per case.
- [ ] **C-P2-4 pricing decision (WS-6 overlap)**: all 60 cases resolve `priceSource:'fallback-ev'` because `cs-prices.json` is absent. Decide: (a) generate prices via `buildCsCollection.mjs --prices`, or (b) formally accept fallback-EV and remove the dead "market median" label path. Document the choice.

## Status board
| Task | Priority | Status | Commit | Notes |
|---|---|---|---|---|
| C-P0-1 fairness panel | P0 | DONE | (this batch) | CaseFairnessPanel reads getProvablyFair/getRecentRolls/setClientSeed; per-drop nonce badge; deterministic-seed wording |
| C-P0-2 real EV panel | P0 | DONE | (this batch) | payoutMultiplier=evGc/casePrice; winProbability=weighted share value>=price |
| C-P0-3 odds table | P0 | DONE | (this batch) | caseDropOdds() per-rarity % from deduped weights |
| C-P1-1 dedupe weights | P1 | DONE | (this batch) | RARITY_DROP_WEIGHTS single source in caseEconomy; caseOpening aliases it |
| C-P1-2 default collapsed | P1 | todo | | |
| C-P1-3 filter leak | P1 | todo | | |
| C-P2-1 dead CSS | P2 | todo | | |
| C-P2-2 cold-load skeleton | P2 | todo | | |
| C-P2-3 per-case stats | P2 | todo | | |
| C-P2-4 pricing decision | P2 | todo | | WS-6 overlap |
