# Stake/Rainbet Waves 31–32 Close-out — 2026-05-24

Two-wave drop after Waves 21–30. Targeted on the user's hardest follow-ups:
massive CS2 collection, deeper slot feature contracts, slot art polish, more
case SFX. Final score: **125 tests across 26 files**, build clean ~9s, **89
procedural 16-bit WAVs** generated (52 SFX one-shots + 19 BGM loops),
**472 CS2 crates / 2,092 unique skins / 14,802 contains rows** indexed.

## Wave 31 — Massive CS2 collection + Pokedex + multi-row + SFX

### Build script (`scripts/buildCsCollection.mjs`)
Rewrites the prior `buildCsCases.mjs` curated list into a full pull from the
ByMykel/CSGO-API:

- `crates.json` — every Case, Souvenir Package, Sticker Capsule, Patch Pack,
  Music Kit Box, Container.
- `skins.json` — every skin paint variant.
- Outputs:
  - `public/data/cs-collection.json` (~8.4 MB) — full pokedex catalog
    keyed by skin id, including:
    - rarity (name + color + tier + multiplier)
    - weapon, category, pattern, paint index, phase
    - min/max float
    - statTrak / souvenir flags
    - per-skin `wearVariants[]` (FN / MW / FT / WW / BS where applicable)
    - parent crates + collections
  - `public/data/cs-cases.json` (~389 KB) — playable subset (60 cases ×
    up to 18 items) for the carousel game; tier auto-assigned from the
    rarest item's multiplier.
  - `public/data/cs-prices.json` — optional; generated only when called
    with `--prices` flag using the `csmarketapi_token` from `.env.local`.
- Re-runnable: re-run any time to refresh.

### Pokedex hook (`useCaseCollection`)
Schema rewrite. Variant key:
`${skinId}::${wear}::${statTrak ? 'st' : 'reg'}::${souvenir ? 'sv' : 'std'}`

Every drop counts as a separate pokedex entry, so float, wear, StatTrak™
and Souvenir flags all pump the variant count. Drops capped at 400 newest;
pokedex never prunes ("gotta gather them all"). Storage moved to
`gampo_cases_drops_v2` and `gampo_cases_pokedex` (legacy v1 keys ignored).

`summary`: totalDrops, uniqueVariants, **catalogTotal** (from `useCsCollection`),
**completionPct**, bestMultiplier, bestSkin.

### Catalog loader (`useCsCollection`)
Lazy-loads the 8 MB collection JSON only when something asks (Pokedex tab
opens). Module-scope cache + listener pattern matches `useGlobalPnl`.

### CasesGame rewrite
- **Multi-row simultaneous opening** — pick 1 / 3 / 5 / 10 rows. Every row
  spins independently with its own carousel; all settle within the same
  3.5s window. Stake = bet × rows.
- **Wear roll** — each drop rolls FN / MW / FT / WW / BS using a weighted
  ladder; float rolled inside the wear's float range. Wear tweaks the
  multiplier slightly (FN +10%, MW +4%, FT 0%, WW −8%, BS −15%) so a
  Battle-Scarred Covert reads different from a Factory New.
- **StatTrak™** — 10% chance per drop; 1.6× multiplier bump.
- **Souvenir** — 6% chance (when not StatTrak); 1.3× bump.
- **Big case grid** — replaces the old narrow row. Up to 60 cases shown
  per tier, filtered by search box, capped at 360 px scroll.
- **Pokedex view** replaces the old collection tab — search by name,
  rarity dropdown, sort by Best multiplier / Recent / Count / Lowest float
  / Name. Every entry shows wear, float (3-decimal), multiplier, and a
  count badge. StatTrak gold border, Souvenir cream border.
- **Sell mode removed** (per user spec — no selling, no trading).
- **Pokedex completion bar** in the bet panel showing
  `discovered / catalogTotal` percent.
- **History view** gains float column + StatTrak / Souvenir tags.

### Case SFX expansion
`scripts/genSfx.mjs` extended with 8 new case-specific roles, all now
wired to the manifest:

- `cases/lid.wav`        — heavy thud variant for crate slam
- `cases/multispin.wav`  — sting played when 3/5/10 rows kick off together
- `cases/knife.wav`      — rare ★ knife/gloves drop fanfare (chord-up)
- `cases/gloves.wav`     — alternative gloves sting
- `cases/stattrak.wav`   — short bright stinger when StatTrak™ rolls
- `cases/souvenir.wav`   — warm chord when souvenir variant rolls
- existing `open / tick / land / rare / reveal / win / lose` retained

CasesGame plays:
- `multispin` when `rows >= 3`
- `knife` when result name matches knife/gloves/bayonet/karambit/huntsman/talon
- `stattrak` if any pick is StatTrak
- `souvenir` if any pick is Souvenir

Total `public/audio/cases/` files: 13 WAVs (was 7).

### Tests
`useCaseCollection.test.js` rewritten to cover the new variant key
(7 tests, all green) — variant-key stability, separate pokedex entries
for ST / SV / wear changes, drop cap of 400, best-multiplier preservation,
reset wipe.

## Wave 32 — Slot feature contract + bonus polish + per-template card art

### Deep feature contracts (`src/data/slotFeatureContracts.js`)
20 templates × structured contract:

- `summary` — 1-line plain-English pitch
- `mechanics[]` — every feature explained: name + detail (e.g. "Cluster
  pays — 5+ touching symbols form a cluster on a 6×6 grid")
- `bonusEntry` — exactly how to trigger the bonus
- `bonusFlow[]` — bullet list of what happens during the bonus
- `volatility` — math note ("High volatility, ~94.5% RTP")
- `buyBonus` — buy-bonus tier breakdown when applicable

Templates covered: vault-rush, river-catcher, dust-rail, storm-banner,
bassline-bonus, scarab-spin, bars, blue-samurai, wanted-revelation,
gates-ascent, bass-bayou, mummy-cascade, phoenix-megaways,
mansion-megaways, ghostblade-strike, iron-fist, coop-cluck, miko-spirit,
forge-anvil, gummy-drops.

### Feature contract panel (`SlotsGame.jsx`)
The "Feature contract" toggle in the bet panel renders the structured
contract with sections + bullet lists instead of the old single-line
`featureText`. Falls back to `featureText` if no contract is registered.
Tag row gains `Wheel` and `Stacked wilds` chips.

### Per-template card-rank art (asset manifest)
`scripts/assetManifest.js` extended with **20 wide rank-symbol atlases**
(`slot-rank-<template>.png`), each showing five themed rank symbols
(10 / J / Q / K / A) tuned to the template's vibe:

- vault-rush → bank vault deposit slips with embossed gold rank
- river-catcher → wooden fishing bobbers
- dust-rail → western sheriff badges with engraved rank
- storm-banner → mythic shields with rune-style rank
- bassline → backstage passes with magenta lettering
- scarab → Egyptian sandstone tablets
- bars → classic Vegas chrome plaques
- blue-samurai → cobalt-blue paper talismans
- wanted-revelation → weathered wanted-poster snippets
- gates-ascent → Olympian marble plinths with laurel border
- bass-bayou → bayou tackle tags with brass nail trim
- mummy-cascade → Egyptian linen-wrapped tablets
- phoenix-megaways → phoenix feathers with embers
- mansion-megaways → gothic velvet plaques with silver filigree
- ghostblade-strike → ghostblade tsuba with cyan glow
- iron-fist → boxing belt buckles
- coop-cluck → painted farm wood signs
- miko-spirit → Japanese paper lanterns
- forge-anvil → molten iron plate stamped rank
- gummy-drops → candy-coated jellies

Run `node scripts/genAssets.js --filter=slot-rank-` to generate. Each
goes to `public/assets/games/slots/<skin>/slot-rank-<template>.png`.

### Per-skin cell tinting (immediate visual win)
Until the per-template rank atlases are generated, every slot stage now
tints the existing card art via CSS `color-mix(--slot-accent, ...)`:

- Cell border, base gradient, ::after halo all keyed off the skin accent
- Pay symbol `<em>` and `<strong>` text glows in the skin accent color
- Wanted-Revelation stays orange; Phoenix stays ember-red; Spirit stays
  rose-pink, etc., so JQK reads as themed even though the underlying PNG
  is shared.

### Bonus banner / pill polish
- `slot-result-banner` and `slot-bonus-end-banner` now use:
  - radial accent halo from the top
  - 2–3 px accent border
  - 60–100 px outer glow tinted to skin accent
  - inset highlight stripe for the inner top edge
- Slot stage pills (free-spin / multiplier / coin meter / cascade) now
  glow with the skin accent + 4 px tinted shadow.

## Verification

- `npm test` → **125 tests across 26 files** all green.
- `npm run build` → clean, 9.07s. Main entry stays ~123 KB / 35 KB gzip.
- `node scripts/buildCsCollection.mjs` → 472 crates kept, 2,092 unique skins,
  14,802 contains rows; `cs-collection.json` 8.40 MB; `cs-cases.json`
  389.3 KB / 60 playable cases.
- `node scripts/genSfx.mjs` → 89 WAV files written.

## Files added

- `scripts/buildCsCollection.mjs` (replaces `buildCsCases.mjs`)
- `src/hooks/useCsCollection.js`
- `src/data/slotFeatureContracts.js`
- `public/data/cs-collection.json` (8.4 MB) — generated
- `public/audio/cases/{lid,multispin,knife,gloves,stattrak,souvenir}.wav` — generated

## Files modified

- `src/components/games/cases/CasesGame.jsx` — full rewrite for multi-row + pokedex.
- `src/components/games/cases/cases.css` — Wave 31 grid + StatTrak/Souvenir styles.
- `src/hooks/useCaseCollection.js` — variant-key schema rewrite.
- `src/hooks/useCaseCollection.test.js` — covers new schema (7 tests).
- `src/components/games/slots/SlotsGame.jsx` — feature-contract panel.
- `src/components/games/slots/slots.css` — feature-contract block, per-skin tint, bonus polish.
- `src/audio/sfxManifest.js` — wires new case SFX.
- `scripts/genSfx.mjs` — 8 new case SFX one-shots.
- `scripts/assetManifest.js` — 20 new per-template rank-symbol atlases.
- `public/data/cs-cases.json` — regenerated with the new builder.

## Known follow-ups

- Run `node scripts/genAssets.js --filter=slot-rank-` (network + 9router
  budget). Each PNG is wide 1792×1024; the slot CSS still uses the
  classic per-symbol PNGs as cells, so the new atlases will need a
  follow-up patch in `slotFactory.js` to swap in per-skin rank PNGs once
  the binaries land.
- Optional `--prices` enrichment for `cs-prices.json` (manifest read of
  csmarketapi_token from `.env.local`).
- BGM `bonus` mode binaries (still null in manifest; falls back to idle).
- Browser smoke is still gated by the Playwright session lock — manual
  smoke is the user-side step.
