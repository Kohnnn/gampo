# Crash audio assets

Clone-owned Stake-style Crash SFX:

- `click.wav`   - panel/button click
- `tick.wav`    - per-0.1x multiplier tick during flight
- `cashout.wav` - cashout sting
- `win.wav`     - cashout win sting (alt)
- `lose.wav`    - bust/explosion sting

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate

## Provenance

- Source: 9Router-generated in audio batch wave
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\08-crash-core.md`

## Status

Wave 2 ships silent. `useSfx('crash')` is wired in `CrashGame.jsx`.
