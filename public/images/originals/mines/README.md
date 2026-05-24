# Mines image assets

Clone-owned visuals for Stake-style Mines. Wave 2 keeps the existing
`/images/mines/bomb.svg`, `/images/mines/diamond.svg`, and
`/images/mines/bomb_effect.gif` in place. Raster stage assets land in
later batches if generated.

## Roles

- (no critical raster assets in Wave 2)
- Optional future: `stage-bg.webp`, themed tile back, themed gem.

## Format

- Backgrounds: WebP, sRGB, max 1600px wide.
- Tiles/gems: SVG.

## Provenance

- Source: 9Router-generated in image batch wave when needed
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\01-mines-core.md`
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\screenshots\01-mines\`

## Status

Wave 2 ships without new raster stage assets for Mines. Manifest entry
under `src/components/games/resources/originalsManifest.js` declares an
empty `stage` map so the preloader is a no-op for Mines today.
