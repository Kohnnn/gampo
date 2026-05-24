# Mines audio assets

Clone-owned Stake-style Mines SFX:

- `click.wav`   - panel/button click
- `reveal.wav`  - safe gem reveal
- `cashout.wav` - cashout sting
- `win.wav`     - cashout win sting (alt)
- `lose.wav`    - bomb hit / bust

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate

## Provenance

- Source: 9Router-generated in audio batch wave
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\01-mines-core.md`

## Status

Wave 2 ships silent. `useSfx('mines')` calls in `MinesGame.jsx` are
already wired and become audible once `.wav` binaries land here AND
`sfxManifest.js` references them.
