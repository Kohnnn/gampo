# Animations

GamPo's animation system has three layers, in order of weight:

1. **CSS keyframes** in `src/components/fx/fx.css` for cheap micro-interactions (pop, pulse, flip, shake, glow, ripple, particles, number bumps).
2. **`framer-motion`** lazy-loaded per route via `src/components/fx/motion.js` for richer per-game animations (springs, layout transitions, gesture handling).
3. **Web Audio synth** in `src/audio/AudioProvider.jsx` for short feedback tones (click, win, loss, deal, flip, explode, tick).

## fx primitives

Importable from `src/components/fx/index.jsx`:

- `<NumberRoll value={n} format={formatter}>` — renders a number with a brief bump animation when the value changes.
- `<Pop keyValue>` — entry pop. Pass a changing `keyValue` to retrigger.
- `<Pulse>` — gentle in-and-out scale loop.
- `<Particles count color>` — radial confetti / sparks burst (used for win moments).
- `<RippleButton>` — drop-in replacement for `<button>` with click ripple.
- `useReduceMotion()` — `[reduce, setReduce]` hook syncing to `localStorage` and toggling a `gampo-reduce-motion` class on `<html>`.

CSS classes available without JS:

- `.fx-pulse`, `.fx-pop`, `.fx-flip`, `.fx-shake`, `.fx-glow`, `.fx-ripple`, `.fx-particles span`.

## Reduced motion

The header has a Reduce-Motion toggle (next to the Audio toggle). When on:

- `.gampo-reduce-motion` is added to `<html>`.
- All fx animations are disabled via global `animation: none !important` rules.
- `prefers-reduced-motion: reduce` is also respected.

## Audio

`useAudio()` exposes `{ muted, setMuted, play, toggle }`. Sounds are synthesized on the fly with `OscillatorNode` so there are no audio assets to ship. Default state is **muted**.

Available sound names: `click`, `win`, `loss`, `deal`, `flip`, `explode`, `tick`.

## framer-motion (lazy)

For a game that needs richer motion, do:

```js
import { useEffect, useState } from 'react'
import { loadMotion } from '../components/fx/motion'

function FancyGame() {
    const [motionApi, setMotionApi] = useState(null)
    useEffect(() => {
        loadMotion().then(setMotionApi)
    }, [])
    if (!motionApi) return <CssOnlyFallback />
    const { motion, AnimatePresence } = motionApi
    return <motion.div animate={...}>...</motion.div>
}
```

This keeps `framer-motion` out of the home/lobby chunk. It only ships when the user opens a game that uses it.

## Per-game polish (status)

| Game            | Status                                                                                                |
|-----------------|-------------------------------------------------------------------------------------------------------|
| Crash           | CSS pulse + history dot enter                                                                         |
| Plinko          | Drop-shadow + hit-flash on bins                                                                       |
| Mines           | Hover lift + flip + bomb burst                                                                        |
| **Dice**        | Glowing marker, win-zone fill, NumberRoll, particle burst, audio, **BigWinOverlay (≥5×)**             |
| **Limbo**       | Rocket gauge, drifting starfield, NumberRoll, particle burst, audio, **BigWinOverlay (≥5×)**          |
| **Coin Flip**   | 3D rotateY coin (front/back+edge), 0.9s flip, particle ring, audio                                    |
| **Wheel**       | Smooth 2.1s ease-out spin, biased landing, particle burst, audio, **BigWinOverlay (≥5×)**             |
| **Color Pick**  | Spinning spectrum disc with pointer, decelerating land, color paint result, audio                     |
| **Guess Number**| Spinning orb, win/loss state shadow, sparkle particles, audio, **BigWinOverlay (any 9.4× hit)**       |
| **RPS**         | Side slam-in, winner scale, loser desaturate, push shake, particle burst, audio                       |
| **Hi-Lo**       | Card flip, win/loss border, streak counter with fire flair at 3+, audio                               |
| **Blackjack**   | Real card render, hidden hole-card, chip-fly, 500-hand study runner                                   |
| **Baccarat**    | Squeeze reveal (700ms delay), bead road, win/loss flash, particles, audio                             |
| **Casino War**  | Card slam from sides, Go-To-War tie option, win/loss flash, particles, audio                          |
| **Video Poker** | Paytable highlight, real card render, hold-pin animation, deal stagger, audio, **BigWinOverlay (≥9×)**|
| **Tower**       | Parallax climb, current tile pulse, fall rotate-drop, cashout pulse, particles, audio, **BigWinOverlay (≥5×)** |
| **Chicken Cross**| Chicken sprite (hop/splat states), occasional car flyby chrome, cashout pulse, particles, audio      |
| **Lottery**     | Tumbler shake + drop-by-drop ball reveal, hit cells gold scale-pop, sparkle particles, audio, **BigWinOverlay (≥8×)** |
| **Keno**        | Drop-by-drop drawn balls, hit cells scale-pop with green glow, audio                                  |
| **Sic Bo**      | Cup shake → dice tumble out one by one, triple-win glow, win/loss flash, audio                        |
| **Slots**       | True reel-by-reel stop, cluster-glow on winning cells, particles, audio, **BigWinOverlay (≥5×)**      |
| **Roulette**    | Real spinning wheel (37 segments, correct order), counter-rotating ball, decelerate landing, audio, **BigWinOverlay (effective ≥5×)** |

## BigWinOverlay tiers

`<BigWinOverlay>` is a shared primitive at `src/components/games/primitives/BigWinOverlay.jsx`. When triggered above the configured `threshold`, it auto-classifies the multiplier into a tier:

| Multiplier | Tier      | Visual                                |
|-----------:|-----------|---------------------------------------|
| 5×–14×     | BIG WIN   | gold border-image, 96px multiplier    |
| 15×–49×    | HUGE WIN  | pink accent, 120px multiplier         |
| 50×+       | MEGA WIN  | pink/violet border-image, 144px text  |

Lifecycle: 0.6s pop-in, ~2.4s sustain, fade out. Non-blocking (`pointer-events: none`). Includes 24-particle radial burst with per-segment delay, plus a 3-second conic-gradient ray sweep (mix-blend `screen`).

Trigger pattern in a game:

```jsx
const [bigWin, setBigWin] = useState({ trigger: 0, profit: 0, multiplier: 0 })
// after a win:
if (multiplier >= 5) {
    playSound('bigwin')
    setBigWin({ trigger: Date.now(), profit, multiplier })
}
// in JSX:
<BigWinOverlay trigger={bigWin.trigger} profit={bigWin.profit} multiplier={bigWin.multiplier} threshold={5} />
```

The `trigger` prop is any monotonically increasing value (Date.now() works). `BigWinOverlay` auto-shows for 2.4s then hides; reuses the same component instance across plays.

## Quick-action shortcuts

`<BetPanel>` exposes a `bp-quick-actions` row of 3 buttons: **Min**, **Reset**, **Rebet**. The Rebet button is disabled when no `lastBet` prop is provided. Wire by tracking `lastBet` state in the game and passing it to `<BetPanel lastBet={lastBet} />`.

The remaining games will be upgraded in batch 4; see `roadmap.md`.
