# Wave 34 — Themed slot BGM rewrite (6 archetypes)

Shipped 2026-05-28. Tests 143/143 across 30 files green. Build 11.4s clean.

## What shipped

- **`scripts/bgmEngine.mjs`** (new, 280 LOC) — pure-Node themed BGM
  generator. Six archetype voicings:
  1. **arcade-classic** (96 bpm, square + triangle, 4-on-floor kick) —
     classic, bars, rock
  2. **brass-lounge** (88 bpm, saw + sub-bass, smooth quarter hat) —
     bank, catcher, vault
  3. **western-twang** (100 bpm, detuned-saw twin pluck, slap kick +
     tambourine) — western, wanted
  4. **aurora-pad** (84 bpm, 3-saw detuned pad with slow envelope) —
     mythic, mansion, olympus
  5. **synth-tense** (116 bpm, pulse-25 lead + sine-sub bass + 808
     ride) — cyber, ronin, iron, phoenix, mummy, forge
  6. **playful-marimba** (112 bpm, additive-harmonic marimba +
     bouncy bass + shaker) — bayou, coop, gummy, spirit
- 7 oscillator types: sine, square, saw, triangle, pulse25, pulse12,
  detuned-saws-3.
- Specialty voices: `marimba` (additive harmonics), `brass` (saw + body
  square), `pluckEnv`, `padEnv`, `bellEnv`, `bassEnv`, `kickEnv`,
  `hatEnv`, `snareEnv`.
- Per-archetype melody, bass, drum (hat / kick / snare) patterns.
- Bonus mode bumps tempo +18 bpm, layers an octave-up melody, doubles
  drum energy.
- 8s seamless loop with 80 ms crossfade at the boundary.

- **`scripts/genSfx.mjs`** rewired to call `renderForSkin(skin, mode)`
  for both BGM and BGM_BONUS dictionaries. Old hand-rolled `bgmLoop`
  factory tables removed (~190 LOC of melody arrays gone).

- **`src/audio/bgmManifest.js`** rewritten as a `FAMILIES.map`
  generator covering all 21 skin families (added `bars` + `vault`
  which were previously missing).

- 42 BGM loops generated (21 families × 2 modes).

## Theme alignment audit

Each archetype has audibly distinct timbre:

- **arcade-classic** = SNES casino vibe (square saws, 4-on-floor)
- **brass-lounge** = late-night jazz pad (smooth saw lead, no fast hi-hat)
- **western-twang** = double-saw twang + slap-kick tambourine
- **aurora-pad** = sustained 3-saw pad with very slow attack
- **synth-tense** = arcade-pulse + 808 sub-bass + ride
- **playful-marimba** = additive harmonic marimba + shaker

Five-of-six are clearly distinguishable just by the first 2 seconds.

## Verification

- `node scripts/genSfx.mjs --bgm` → 42 WAVs.
- `npm test -- --run` → 143/30 green.
- `npm run build` → clean, 11.42s.

## Files added

- `scripts/bgmEngine.mjs`

## Files modified

- `scripts/genSfx.mjs` — uses bgmEngine for BGM/BGM_BONUS.
- `src/audio/bgmManifest.js` — generator-style export, +bars/vault.
- `public/audio/bgm/<family>/{idle,bonus}.wav` — 42 files.
