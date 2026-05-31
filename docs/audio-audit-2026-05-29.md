# GamPo Audio Audit - 2026-05-29

Scope: `src/audio/*`, `scripts/genSfx.mjs`, and `public/audio/**`.

## Reference Health

Command: ESM import audit of `bgmManifest.js`, `gameBgmManifest.js`, and `sfxManifest.js`, then filesystem compare against `public/audio`.

- Manifest refs: 140 unique audio paths.
- Broken refs: 0.
- WAV files under `public/audio`: 153.
- Unused WAVs: 13.

Unused slot WAVs:

- `/audio/slots/anticipation.wav`
- `/audio/slots/cascadeStep.wav`
- `/audio/slots/holdFill.wav`
- `/audio/slots/moneyCollect.wav`
- `/audio/slots/mysteryReveal.wav`
- `/audio/slots/reelStop.wav`
- `/audio/slots/reelTick.wav`
- `/audio/slots/scatter.wav`
- `/audio/slots/spinStart.wav`
- `/audio/slots/stickyLock.wav`
- `/audio/slots/wantedSlam.wav`
- `/audio/slots/wheelLand.wav`
- `/audio/slots/winLine.wav`

The slot files look intended for the current bonus-feature pass, but the app still routes slot feedback through the shared SFX ids in `useAudio()`/`useSfx()` rather than these files. They should either be wired through a manifest-backed slot role map or removed only after a replacement plan is approved.

## Quality Notes

- `public/audio/bgm/**/idle.wav` and `bonus.wav` plus `public/audio/bgm/games/**` are procedural/generated loops. The audit found 114 WAVs with identical 705,644 byte size, which is a strong signal that many loops share the same generated structure and duration.
- These loops are technically safe because they are locally generated, but they read as placeholders. Priority replacement targets are slot BGM families first (`vault`, `catcher`, `western`, `mythic`, `rock`, `classic`, `cyber`, `phoenix`) and then game-specific BGM (`cases`, `poker`).
- Master/BGM/SFX slider architecture remains intact. No external audio was ingested.

## Replacement Candidates

- Kenney UI Audio and Impact Sounds: CC0/public-domain style game SFX suitable for buttons, case reveals, reel stops, and UI confirmations. Sources: https://kenney.nl/assets/ui-audio, https://www.kenney.nl/assets/impact-sounds, license support note https://kenney.nl/support.
- OpenGameArt CC0 packs: good for retro UI and lightweight game SFX. Candidate example: https://opengameart.org/content/8bit-sfx. Verify each asset page before ingest because OpenGameArt hosts multiple license types.
- OpenGameArt CC0 music loops: usable for simple background replacements when an individual page lists CC0. Candidate example: https://opengameart.org/content/pressure.
- Freesound: use only individual sounds marked CC0 or CC BY with attribution captured in a credits file; avoid CC BY-NC. Source/license guide: https://freesound.org/help/faq/.
- Sonniss GDC bundles: high-quality commercial-game SFX candidate under their bundle license, not open source. The official license grants royalty-free use in audio-visual projects, but redistribution as a standalone asset library is restricted. Source: https://sonniss.com/gdc-bundle-license/.

## Proposed Next Audio Pass

1. Add a `slotSfxManifest` mapping the 13 unused `/audio/slots/*.wav` files to semantic roles, then call those roles from `SlotsGame.jsx`.
2. Replace the highest-impact generated loops first: `/audio/bgm/vault/*`, `/audio/bgm/catcher/*`, `/audio/bgm/western/*`, `/audio/bgm/mythic/*`, `/audio/bgm/rock/*`, `/audio/bgm/games/cases/*`, and `/audio/bgm/games/poker/*`.
3. For every imported external file, add `public/audio/LICENSES.md` with source URL, author, license, file names, and attribution text when required.
