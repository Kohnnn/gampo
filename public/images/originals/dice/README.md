# Dice image assets

Clone-owned visuals for Stake-style Dice. Wave 1 keeps the existing CSS
slider rendering; raster assets land in later batches if/when generated.

## Roles

- (no critical raster assets in Wave 1)
- Future optional: `stage-bg.webp`, decorative dice glyphs, win/lose accent flares.

## Format

- Backgrounds: WebP, sRGB, max 1600px wide.
- Inline glyphs: SVG.

## Provenance

- Source: 9Router-generated in image batch wave when needed
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\02-dice-core.md`
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\screenshots\02-dice\`

## Status

Wave 1 ships without raster stage assets for Dice. The current
CSS-rendered scale and threshold marker stays in place. The manifest
under `src/components/games/resources/originalsManifest.js` declares an
empty `stage` map so the preloader is a no-op for Dice today.
