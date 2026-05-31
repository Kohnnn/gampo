# Tarot Asset Sources

## Plateau Tarot API

- Repository: https://github.com/geraldfingburke/plateau-tarot-api
- API endpoint used by `scripts/fetchPlateauTarot.mjs`: https://geraldburke.com/apis/plateautarot/?count=78&seed=0
- Local fronts: `public/assets/tarot/plateau/`
- Local metadata: `public/data/tarot-deck.json`
- License/source note: the upstream repository presents the project under the
  Unlicense / public-domain-style terms. The app fetches and commits the
  images/data at development time; runtime does not depend on the API.

## Monochrome Card Back

- Local back image: `public/assets/tarot/monochrome/back.png`
- Source: user-provided local pack from `D:\gampo\example\monochrome`.
- Usage: shared card back for every Tarot card.
