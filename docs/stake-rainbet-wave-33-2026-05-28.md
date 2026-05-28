# Wave 33 — Slot rank PNG re-render + transparency strip

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 20s clean.

## What shipped

- `scripts/assetManifest.js` — rewrote 20 slot-rank prompts to insist on
  fully transparent corners, no plate, no bezel, glyph-only artwork.
- 9router regeneration: `node scripts/genAssets.js --filter=slot-rank-`
  produced 20 fresh atlases (~1.4–2.3 MB each, all under cx/gpt-5.5-image).
- `scripts/sliceSlotRankArt.mjs` re-sliced into 100 per-rank PNGs.
- `scripts/stripSlotRankBg.mjs` (new) — algorithmic background stripper:
  - Samples corner + edge pixels for dominant background color.
  - Stamps alpha=0 on every pixel within ΔE ≤ 30 with soft anti-aliased
    falloff so glyph edges survive.
  - Crops to tight bounding box of remaining opaque pixels (8% padding).
  - Square-pads to consistent aspect ratio (6% extra space).
  - Re-encodes RGBA. Has `safeWrite` retry for Windows file locks.
  - **Skips** textured atlases (variance > 1200) where post-processing
    would smear the artwork — those keep their original AI output.
- 105 PNGs successfully stripped (60-93% pixels removed).
- 15 textured tiles preserved as-is (gummy/iron/bars/scarab/phoenix/vault
  variants with high-frequency backgrounds).

## Verification

- `node scripts/genAssets.js --filter=slot-rank-` → 20/20 generated.
- `node scripts/sliceSlotRankArt.mjs` → 100 slices.
- `node scripts/stripSlotRankBg.mjs --atlases` → 105 processed,
  15 skipped textured.
- `npm test -- --run` → **143 tests across 30 files** green.
- `npm run build` → clean, 20.18s.

## Visual result

Rank tiles now read as themed glyphs (vault deposit slip, fishing bobber,
sheriff badge, mythic shield, paper talisman, marble plinth, candy jelly,
etc.) with **transparent backgrounds** so the slot cell's CSS gradient +
accent halo show through. Footprint is consistent ~50–80% of cell
height, matching the existing pay-symbol PNGs.

## Files added

- `scripts/stripSlotRankBg.mjs` — pure-Node alpha-strip + crop tool.
- `docs/stake-rainbet-wave-33-2026-05-28.md` (this doc).

## Files modified

- `scripts/assetManifest.js` — 20 prompts rewritten.
- `public/assets/games/slots/<skin>/slot-rank-*.png` — 120 files re-rendered.
