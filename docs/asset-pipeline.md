# Asset pipeline

GamPo's bitmap art (chips, cards, dice, gems, lobby banners, sport crests, slot symbols, etc.) is generated via the **9Router image API** rather than hand-drawn SVG.

This keeps the look consistent and lets us regenerate the whole set from one prompt manifest.

## Prerequisites

Set environment variables before running the script:

```bash
# PowerShell
$env:NINEROUTER_URL = "http://localhost:20128"
$env:NINEROUTER_KEY = "sk-..."

# bash / zsh
export NINEROUTER_URL="http://localhost:20128"
export NINEROUTER_KEY="sk-..."
```

If `requireApiKey` is disabled on the gateway, you can omit `NINEROUTER_KEY`.

## Run

```bash
npm run gen:assets
```

Optional flags:

- `--force` regenerate even if a PNG already exists.
- `--concurrency=N` (default 3) controls parallel calls to the gateway.
- `--filter=substr` only generate manifest entries whose name contains `substr`.
- `GAMPO_IMAGE_MODEL=openai/dall-e-3 npm run gen:assets` pins one model.

The script:

1. Lists models from `${NINEROUTER_URL}/v1/models/image`.
2. Picks the highest-priority available model from a fallback list (`codex/gpt-5.5-image`, `openai/gpt-5.5-image`, `openai/gpt-image-1`, `openai/dall-e-3`, `gemini/gemini-3-pro-image-preview`, FLUX, MiniMax).
3. Iterates `scripts/assetManifest.js` and POSTs each prompt to `/v1/images/generations?response_format=binary`.
4. Saves PNGs into `public/assets/games/<dir>/<name>.png`.
5. Skips existing files unless `--force`.

## Manifest

`scripts/assetManifest.js` exports an array of `{ name, dir, prompt, size }`. A shared `STYLE` guard is appended to every prompt:

> casino UI asset, modern crypto-casino aesthetic, soft 3D render, centered subject, transparent background, clean edges, vibrant accent lighting, no text, no logos, no real brand marks, dark navy or transparent backdrop, no copyrighted characters

To add a new asset:

1. Append a new entry: `{ name: 'gem-red', dir: 'mines', size: '1024x1024', prompt: 'Faceted red gem ...' }`.
2. Re-run `npm run gen:assets`.
3. Reference in code as `<img src="/assets/games/mines/gem-red.png" alt="" />`.

## Output layout

```
public/assets/games/
  lobby/        hero banners
  promo/        promotion banners
  chips/        casino chips
  cards/        card backs and suit symbols
  dice/         dice
  wheel/        spinning wheel art
  roulette/     wheel + ball
  mines/        gems + bombs
  plinko/       balls + pegs
  crash/        rocket + trail
  tower/        tiles
  chicken/      chicken sprites + road + cars
  slots/classic, slots/cyber, slots/mythic
  coin/         heads/tails
  rps/          rock/paper/scissors
  lottery/      ball + tumbler
  sports/       sport crests
```

## Versioning

PNGs are committed to git so the app works without `NINEROUTER_KEY` after the first generation pass. To rebuild a single asset, delete its file and run `npm run gen:assets`.

## Compliance notes

The script's prompts explicitly forbid:

- Vendor or operator logos (Stake, Rainbet, Pragmatic, etc.).
- Copyrighted characters or licensed slot art.
- Real-money payment branding (Visa, crypto exchanges).

If you add a prompt, keep these constraints. The shared `STYLE` guard helps but is not foolproof, so review generated outputs before committing.
