# Common audio assets

This folder holds clone-owned cross-game SFX:

- `click.wav`   - generic UI click
- `reveal.wav`  - generic reveal/select feedback
- `win.wav`     - generic win sting
- `lose.wav`    - generic lose sting
- `cashout.wav` - generic cashout sting

## Format

- 16-bit PCM mono `.wav`
- 44.1 kHz sample rate
- Generated via 9Router in dedicated audio batch waves

## Provenance

- Source: 9Router-generated (audio model TBD per audio batch)
- License: clone-owned
- Reference: Stake/Rainbet audit screenshots (audit folders under `D:\gampo\rainbetclone\`)

## Status

Wave 1 ships silent. No binaries are committed. The `useSfx` system
becomes audible automatically once binaries land here and `sfxManifest.js`
references them.
