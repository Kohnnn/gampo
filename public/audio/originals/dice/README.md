# Dice audio assets

This folder holds clone-owned Stake-style Dice SFX:

- `click.wav` - panel/button click
- `roll.wav`  - dice roll start
- `tick.wav`  - threshold marker tick during roll
- `land.wav`  - result settle
- `win.wav`   - dice-specific win sting
- `lose.wav`  - dice-specific lose sting

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate

## Provenance

- Source: 9Router-generated in audio batch wave
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\02-dice-core.md`
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\screenshots\02-dice\`

## Status

Wave 1 ships silent. The `useSfx('dice')` calls in `DiceGame.jsx` are
already wired and become audible once `.wav` binaries land here AND
`sfxManifest.js` references them.
