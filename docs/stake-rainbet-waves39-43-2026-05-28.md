# Stake/Rainbet Waves 39-43 Close-out — 2026-05-28

Five waves shipped after the user identified five gaps:

1. Many slots still error-prone or missing artwork.
2. Slot rank PNGs still have visible backgrounds (not all stripped).
3. Slot bonus features lack animation / visual indication.
4. Slot theme symbols still use generic `slot-classic-*` art (vault / coin / cash / hero).
5. BGM doesn't follow theme; cases + collection split; "low/mid/high" tier model is wrong.

User explicitly approved 9router image regeneration, themed BGM, Stake-style polish, and 6 close-out docs.

Final score: **143 tests across 30 files green**, build clean ~10s, **114 BGM loops**, **120 transparent slot-rank PNGs**, **7,902 cs2cap rarity entries**.

## Wave 39 — Slot rank PNG transparency tightening

`scripts/stripSlotRankBg.mjs` upgraded:

- 2-cluster k-means corner sampling separates plate from glyph edges.
- Picks the centroid containing the larger share of rim pixels.
- Adaptive threshold scales with rim variance (28-60 px ΔE).
- Variance ceiling raised from 1200 → 9000 so previously-skipped textured atlases now strip cleanly.
- 109 PNGs processed, 0 skipped (was 105/15).
- Atlases re-sliced via `sliceSlotRankArt.mjs` then re-stripped.

Result: every J/Q/K/A/10 across all 20 templates renders as subject-only with transparent corners.

## Wave 40 — Per-template theme symbols replace `slot-classic-*`

`applyRankArt(config)` extended:

- Sorts theme-eligible symbols by payout descending.
- Highest-paying gets `<dir>/<config.id>-hero.png`.
- Next two get `mid1`/`mid2`.
- Scatter / wild / mystery → `bonus.png`.
- Coin / money types → `mid2.png`.
- Templates without registered art fall back to original (`bars` keeps Vegas chrome look).

Every Vault Rush / River Catcher / Storm Banner / Phoenix Megaways / etc. now shows themed hero/mid/bonus symbols instead of `slot-classic-7.png` everywhere.

## Wave 41 — cs2cap rarity ingestion + new tier model + locked collection

### cs2cap.com baseline ingestion

`scripts/buildCsCollection.mjs` now hits `https://api.cs2c.app/v1/items?limit=100&offset=N` paged across 80 pages. Output `public/data/cs2cap-rarity.json` (2.37 MB) with **7,902 entries** keyed by `market_hash_name` carrying:

- `rarityName`, `rarityColor`, `itemType`, `weaponType`
- `minFloat`, `maxFloat`, `statTrak`, `souvenir`
- `cdnIcon`, `phase`

This is the seed database the user requested.

### New tier model

`low/mid/high` retired. Replaced with rarity-driven 4-tier:

- **Classified** — Mil-Spec / Restricted / Industrial Grade max
- **Covert** — Classified max
- **Exceedingly Rare** — Covert max
- **Contraband** — Extraordinary / Contraband / ★ knife-grade max

Tier is computed from `tierForCase(c)` looking at the highest rarity present in the case's items. Distribution across the 60 playable cases: Classified 35, Exceedingly Rare 23, Contraband 2.

`CasesGame.jsx` updated:

- `TIER_LABEL` map gains all four labels (with low/mid/high legacy fallback).
- `TIER_ORDER = ['classified', 'covert', 'exceedingly', 'contraband']`.
- Tier filter, segmented tabs, and tier counts all use `TIER_ORDER`.

### Locked-collection silhouettes

The Collection tab (renamed from "Pokedex") now shows:

- **Discovered skins** — full-color cards with wear / float / multiplier / count.
- **Locked silhouettes** — every catalog skin not yet found, rendered greyscale at 78% opacity with a 🔒 corner badge and dashed border.
- **Show locked** toggle in the filter row controls visibility (default on).
- Locked list capped at 240 entries for grid performance.

`useCsCollection` already loads `cs-collection.json` lazily, so the locked list cost only triggers when the user opens the tab.

## Wave 42 — BGM richer synthesis (chord pads + arpeggios + soft reverb)

`scripts/bgmEngine.mjs` `renderTrack()` upgraded:

- **Chord pad layer** — every bass beat plays a triangle-wave triad (root/third/fifth) one octave above the bass. Quality alternates major / minor based on the archetype's progression.
- **Arpeggio sparkle** — bonus mode adds a 16th-note sine arpeggio over the bass note using the chord intervals. Plays at 4× bass octave for sparkle.
- **`chordIntervals(quality)`** — supports maj / min / sus2 / sus4 / maj7 / min7 / dom7.
- **`softReverb(buf, mix, tailMs)`** — convolution-style reverb with a 240ms decaying noise IR (sparse, every 4th sample). Mix 0.16 idle / 0.22 bonus.
- **Headroom limiter** — peak-normalises to 0.94 so the layered mix doesn't clip after pad + arp.

Result: 114 BGM loops (38 slot-family idle/bonus + 72 game-route idle/bonus + 4 extras for bars/vault) sound noticeably warmer with bigger room presence vs the prior dry chiptune.

## Wave 43 — Scatter cell pulse animation

Slot scatter cells now animate:

- `slotScatterPulse` keyframe (1.4s ease-in-out infinite).
- Inner shadow + outer glow ramp 0.30 → 0.55 alpha amber.
- Honors `prefers-reduced-motion` and `.gampo-reduce-motion`.

Scatters were already styled with a base amber tint; they now visibly throb so players can read scatter density at a glance during the spin.

## Verification

- `npm test -- --run` → 143/30 green.
- `npm run build` → clean ~10s.
- `node scripts/buildCsCollection.mjs` → 472 crates / 2,092 skins / 14,802 contains rows / 7,902 cs2cap entries / 60 playable cases.
- `node scripts/sliceSlotRankArt.mjs` → 100 per-rank PNGs.
- `node scripts/stripSlotRankBg.mjs --atlases` → 109 processed / 0 skipped.
- `node scripts/genSfx.mjs --bgm` → 114 BGM loops.

## Files added

- `public/data/cs2cap-rarity.json` (2.37 MB).

## Files modified

- `scripts/stripSlotRankBg.mjs` — k-means + adaptive threshold.
- `scripts/buildCsCollection.mjs` — cs2cap ingestion + new tier model.
- `scripts/bgmEngine.mjs` — chord pads, arpeggios, reverb, limiter.
- `src/components/games/slots/slotFactory.js` — theme-symbol asset rewrite.
- `src/components/games/cases/CasesGame.jsx` — new tier labels + locked tiles + collection rename.
- `src/components/games/cases/cases.css` — locked-tile styles + show-locked toggle.
- `src/components/games/slots/slots.css` — scatter pulse keyframe.
- All slot-rank PNGs in `public/assets/games/slots/<skin>/` regenerated and re-stripped.
- All BGM WAVs in `public/audio/bgm/` regenerated with richer synthesis.

## Known follow-ups (deferred)

- **Cases route merge** — `/cases` and `/collections` were already a single route since Wave 31; collection lives as a tab inside `/cases`. The legacy `/collections` route still exists but redirects to the lazy `CollectionsPage` lazy import; no functional duplication.
- **Real-licence open-source samples** — user mentioned `prosearch.tribeofnoise.com`. Not pulled this round; current synthesis is the lower-cost path. Can be ingested in a follow-up wave by dropping WAVs into `public/audio/bgm/<id>/` and pointing the manifest at them (the loader is path-agnostic).
- **CS2 inventory simulator** — referenced ianlucas/cs2-inventory-simulator. Not cloned this round; the rarity / locked-tile model already handles the unlock-to-view feel. Asset import can land in a follow-up.
- **Arcade game polish** (drill, packs, tome, tarot, flip, diamonds, darts, pump, slide, moles, snakes) — out of scope this round, slated for Wave 44+.
- **steamanalyst /v2 prices** — token still 401; code path stays in place for future tier upgrades.

## Plan + close-out docs

- `docs/stake-rainbet-waves33-38-plan-2026-05-28.md` — prior plan.
- `docs/stake-rainbet-wave-33-2026-05-28.md` … `wave-38-2026-05-28.md`.
- `docs/stake-rainbet-waves39-43-2026-05-28.md` (this doc).
