# Keno image assets

Clone-owned visuals for Stake-style Keno. Wave 2 keeps the existing
CSS-rendered number grid; raster stage assets land in later batches if
generated.

## Roles

- (no critical raster assets in Wave 2)
- Optional future: `stage-bg.webp`, themed number tile.

## Format

- Backgrounds: WebP, sRGB, max 1600px wide.
- Tiles: SVG / CSS.

## Provenance

- Source: 9Router-generated in image batch wave when needed
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\06-keno-core.md`
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\screenshots\06-keno\`

## Status

Wave 2 ships without new raster stage assets for Keno. Manifest entry
under `src/components/games/resources/originalsManifest.js` declares an
empty `stage` map.
