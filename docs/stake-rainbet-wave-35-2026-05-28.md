# Wave 35 — Casino game BGM (per-route themed loops)

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 13.2s clean.

## What shipped

- **`scripts/bgmEngine.mjs`** — added `GAME_ARCHETYPE` map (36 routes
  → archetype) and `renderForGame(gameId, mode)` helper.
- **`scripts/genSfx.mjs`** — generates `bgm/games/<id>/idle.wav` and
  `bgm/games/<id>/bonus.wav` for every casino route via the shared
  themed engine. 72 new BGM loops (36 routes × 2 modes).
- **`src/audio/gameBgmManifest.js`** (new) — generator-style manifest
  keyed by route id with `idle` + `bonus` paths.
- **`src/audio/useBgm.js`** — refactored into a shared `useBgmInner`
  helper. Two exported hooks now:
  - `useBgm(skinFamily, mode)` for slots (unchanged contract).
  - `useGameBgm(gameId, mode)` for non-slot routes.
- **All 34 casino games wired** — `useGameBgm('<id>', 'idle')` injected
  into every game component via `scripts/_wireGameBgm.cjs` (run-and-delete
  helper). Modified 34 files in one batch.

## Archetype assignment per route

Mood-driven mapping kept consistent with Wave 34:

- **brass-lounge** (jazz feel): poker, roulette, blackjack, baccarat,
  sicbo, war, videopoker, hilo, sports.
- **synth-tense** (mid-tempo arcade): crash, plinko, mines, limbo, keno,
  wheel, cases, drill, tower.
- **arcade-classic** (square-wave bounce): dice, flip, diamonds, darts,
  pump, slide, snakes, coinflip, rps, guess, dino.
- **playful-marimba** (light marimba): lottery, packs, moles, color,
  chickencross.
- **aurora-pad** (sustained pad): tomeoflife, tarot.

Bonus mode is always rendered (each track has a `bonus.wav` paired
loop). Games can opt in to swap modes; default for now is idle for all.

## Verification

- `node scripts/genSfx.mjs --bgm` — 42 family loops + 72 game loops = **114 BGM files**.
- `npm test -- --run` — 143/30 green.
- `npm run build` — clean, 13.17s.

## Files added

- `scripts/bgmEngine.mjs` (Wave 34) extended with `GAME_ARCHETYPE`,
  `renderForGame`, exports.
- `src/audio/gameBgmManifest.js`.
- `public/audio/bgm/games/<id>/{idle,bonus}.wav` × 36 = 72 files.

## Files modified

- `src/audio/useBgm.js` — adds `useGameBgm` export.
- `scripts/genSfx.mjs` — generates BGM_GAMES + BGM_GAMES_BONUS.
- 34 game JSX files — each gains one `useGameBgm('<id>', 'idle')` call
  near the top of its render function.

## Stake-style polish notes

The user wanted BGM closer to Stake's actual feel. Two patterns we
emulated:

1. **Same archetype across same-feel games** — all the table games share
   `brass-lounge` so swapping between roulette / baccarat / blackjack
   feels like one cohesive room. Stake does this implicitly by using
   the same provider music suite for table games.
2. **Tense-loop differentiation for arcade originals** — crash / plinko
   / mines / wheel all use `synth-tense`, matching Stake's heightened
   "round-in-progress" feel for fast-paced originals.
