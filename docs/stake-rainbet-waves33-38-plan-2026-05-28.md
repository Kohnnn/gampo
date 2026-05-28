# Stake/Rainbet Waves 33-38 — Plan (2026-05-28)

Six-wave finish-line pass driven by user feedback after the initial CODEX
handoff prompt. User approved Q1-Q4 answers:

1. **9router image regen is approved** — focus on absolute quality.
2. **6 BGM archetypes** shared across slot families; same archetype shared
   across similar casino games. Slot loops 1:1 replicated quality target.
3. **Stake-style polish** — closer to Stake's actual UX feel; optimize UI/UX.
4. **6 separate close-out docs** — one per wave (matches prior pattern).

## Wave 33 — Slot rank PNG re-render + transparency

The 9router atlases came back as opaque RGBA "framed plates" — every tile
has a baked-in bezel + halo. Stack with the slot cell's own gradient and
the 10/J/Q/K/A read as muddy black/white blocks.

**Approach:** regenerate the 20 atlases with stricter prompts (no plate,
fully transparent corners, subject-only) AND post-process with an
algorithmic alpha-strip + tight bounding box crop so even imperfect
generations end up subject-only.

- Update `scripts/assetManifest.js` slot-rank prompts: emphasize
  "transparent background, no plate, no bezel, no halo, glyph only,
  >70 % of pixels transparent". Keep same template ids.
- Re-run `node scripts/genAssets.js --filter=slot-rank- --force` to
  generate fresh 1792×1024 atlases.
- Add `scripts/stripSlotRankBg.mjs` that:
  - Decodes each per-rank slice (filter-aware decoder from `sliceSlotRankArt.mjs`).
  - Samples corner + edge pixels to detect dominant background color.
  - Stamps alpha=0 on every pixel within ΔE ≤ 22 of that color.
  - Crops to a bounding box of remaining opaque pixels with 8 % padding.
  - Re-encodes as RGBA PNG.
- Re-slice via `scripts/sliceSlotRankArt.mjs`.
- Run stripper over the 100 sliced PNGs.
- Verify: random slice should now show >50 % alpha-0 pixels and a tighter
  visual footprint.

## Wave 34 — Themed slot BGM rewrite (6 archetypes)

Current BGM is one engine (`bgmLoop`) with different note tables — every
loop sounds like the same chiptune at different speeds. User wants
"absolute slots 1:1 replicated quality".

**Six archetypes:**
1. **arcade-classic** — square + triangle, kick + hat at 96 bpm. Coverage:
   classic, bars, rock.
2. **brass-lounge** — saw lead + sub-bass + closed hat at 88 bpm,
   chord progression bvi-bIII-IV-i. Coverage: bank, vault.
3. **western-twang** — pluck saw + slap kick + tambourine at 100 bpm,
   minor pentatonic. Coverage: western, wanted.
4. **aurora-pad** — detuned saws + low triangle + soft snare at 84 bpm,
   sus2 pad. Coverage: mythic, mansion, olympus.
5. **synth-tense** — pulsewidth saw + 808 + ride at 116 bpm, minor key,
   delay tail. Coverage: cyber, ronin, iron, phoenix, mummy, forge.
6. **playful-marimba** — marimba synth + bouncy bass + shaker at 112 bpm,
   major key. Coverage: bayou, coop, gummy, spirit, catcher.

**Implementation:**
- Add a `drum` track generator + percussion patterns per archetype.
- Add an envelope helper for plucked vs sustained voices so timbres
  diverge audibly.
- Use additive harmonics for the marimba/brass voices instead of plain
  square.
- Idle vs bonus: bonus loops keep archetype but bump tempo by 18 bpm,
  add an octave-up melody layer, and double the percussion energy.
- Re-run `node scripts/genSfx.mjs --bgm` → 38 loops re-generated.

## Wave 35 — Casino game BGM (shared archetypes, +5-6 loops)

Only `SlotsGame.jsx` calls `useBgm`. Every other route is silent.

**Implementation:**
- Add `gameBgmManifest` keyed by route id mapping to 1 of 6 archetypes
  (or a route-specific track for marquee games).
- Generate **5 new dedicated tracks** for marquee categories:
  - `bgm/games/poker/idle.wav` — late-night jazz (saxophone substitute via brass)
  - `bgm/games/crash/idle.wav` — synth-tense at 124 bpm with arpeggio
  - `bgm/games/dice/idle.wav` — arcade-classic at 100 bpm
  - `bgm/games/blackjack/idle.wav` — brass-lounge at 92 bpm
  - `bgm/games/originals/idle.wav` — playful-marimba at 108 bpm
- Reuse archetype BGM for the rest:
  - mines/plinko/limbo/wheel/keno → `synth-tense`
  - tower/chickencross/coinflip/rps/guess/color/dino → `arcade-classic`
  - roulette/baccarat/sicbo/war/videopoker/hilo → `brass-lounge`
  - lottery/cases/drill/packs/tome/tarot/flip/diamonds/darts/pump/slide/moles/snakes → `playful-marimba`
- Add `useBgm` calls to every game route; honor master mute.
- Add a header chip in `GameToolbar.jsx` that displays the current track
  name (Stake-style "now playing" pill).

## Wave 36 — CS case feel parity (Stake/CaseClicker-grade)

Carry over Gap 3 from CODEX prompt with Stake-grade polish:

- **Lid lift** — case card lifts via CSS pseudo-element + box-shadow
  push, ~250 ms before carousel kicks off. Plays `cases/lid.wav`.
- **Light streak** — vertical white-to-transparent gradient sweeps
  across the carousel viewport in the last 1 s before settle. CSS
  keyframes, compositor-only.
- **Camera zoom** — last 600 ms of carousel: `transform: scale(1.02 → 1.18)`
  on the active prize tile only via `:nth-child(N)` targeted by
  `--prize-index` CSS var. translateZ to keep on GPU.
- **Mini-celebration** — when rarity ≥ Restricted, fly the prize card
  to center-screen at 1.4× scale, gold/purple radial halo, 18 confetti
  particles. Reuses existing `cases-particles` mark.
- **Skip animation** — `Skip ▶▶` button in the bet panel; resolves the
  round instantly, plays SFX condensed into 250 ms, records drops normally.
- Wire `cases/multispin.wav` on `rows >= 3` (already fires), keep
  `cases/rare.wav` and `cases/knife.wav` on rare drops.
- All animations honor `prefers-reduced-motion`.

## Wave 37 — Slot mid-bonus anim + sim-bet strips + smarter poker bot

Bundles three independent shipments.

**Mid-bonus animations:**
- Wheel disc spin → damped-spring wobble for 350 ms before locking.
- Hold-respin tile pulse 1× → 1.18× → 1× over 200 ms with shadow burst.
- Free-spin retrigger fly-from-cell-to-pill (320 ms ease-out).
- Cluster cascade dotted-line trace under dropping cells (200 ms each).

**Sim-bet strips:**
- New `<SimBetStrip />` primitive in `src/components/games/primitives/`.
- Reuses 18-player roster + 6-persona templates from `SocialContext.jsx`.
- Per game: emit 1 sim row per round, cap visible rows at 8-12.
- Wire to mines/dice/plinko/limbo/wheel/keno.
- Whales bias higher bets/longer targets.

**Smarter poker bot:**
- `HeuristicBot.js` accepts `persona` prop (`tight-passive`,
  `loose-aggressive`, `whale`, `cautious`, `analyst`).
- Postflop equity: 150 → 250 rollouts when SPR < 4.
- Soft anchor to `/data/poker/postflop.json` GTO frequencies on matched
  textures.
- River bluff frequency by persona band (whale 25%, LAG 18%, tight 4%).
- Wire per-seat persona into `Game.js` and `PokerGame.jsx`.

## Wave 38 — Mobile/tablet + per-game polish + grand close-out

**Mobile/tablet:**
- Slot wheel/hold overlay shrink at 375×667 so it doesn't crop.
- ChatDock at < 360 px: tab labels become icon-only.
- Cases pokedex grid at 480 px: 2 columns instead of 3, rarity filter as
  button group.
- Game tools popover anchors bottom-right at < 480 px.

**Per-game polish:**
- Roulette: pre-spin idle wheel rotation.
- Blackjack: chip slide on bet placement.
- Lottery: 200 ms damped wobble on tumbler stop.
- Tower: row-by-row light-up ladder on advance.
- ChickenCross: 220 ms cross-fade on lane advance.
- VideoPoker: hold toggle pulse.

**Grand close-out:**
- Single doc summarizing Waves 33-38.
- Append summary lines to `docs/stake-rainbet-followups-2026-05-25.md`.

## Constraints

- Maintain ChatDock 4-tab order (Stats / Progress / Chat / Race), 400 px width, portal popover.
- Never reduce test count.
- Build stays clean ≤ 15 s.
- New 9router calls allowed but only for slot-rank atlases (not new icons).

## Verification gates per wave

- `npm test -- --run` green.
- `npm run build` clean.
- New tests where they make sense (sim-bet strip persona distribution,
  poker bot persona bands, etc.).
- Doc per wave: `docs/stake-rainbet-wave-NN-2026-05-28.md`.
- Trailing line in `docs/stake-rainbet-followups-2026-05-25.md`.
