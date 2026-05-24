# Keno audio assets

Clone-owned Stake-style Keno SFX:

- `click.wav`  - panel/button click
- `reveal.wav` - per-number draw chime
- `win.wav`    - hit / payout sting
- `lose.wav`   - miss sting

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate

## Provenance

- Source: 9Router-generated in audio batch wave
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\06-keno-core.md`

## Status

Wave 2 ships silent. `useSfx('keno')` is wired in `KenoGame.jsx`.
