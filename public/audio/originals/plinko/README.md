# Plinko audio assets

Clone-owned Stake-style Plinko SFX:

- `click.wav`  - panel/button click + drop
- `peg.wav`    - per-collision tick (optional, throttled)
- `bucket.wav` - bucket settle
- `win.wav`    - bucket payout sting
- `lose.wav`   - low/zero bucket sting

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate

## Provenance

- Source: 9Router-generated in audio batch wave
- License: clone-owned
- Reference: `D:\gampo\rainbetclone\stake-originals-audit-2026-05-23\notes\04-plinko-core.md`

## Status

Wave 2 ships silent. `useSfx('plinko')` is wired in `PlinkoGame.jsx`.
