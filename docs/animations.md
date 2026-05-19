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
| **Dice**        | Batch 2: glowing marker, win-zone fill, NumberRoll, particle burst, audio                             |
| **Limbo**       | Batch 2: rocket gauge, drifting starfield, NumberRoll, ring color shift, particle burst, audio        |
| **Coin Flip**   | Batch 2: 3D rotateY coin (front/back+edge), 0.9s flip, particle ring, audio                           |
| **Wheel**       | Batch 2: smooth 2.1s ease-out spin, biased landing, particle burst, audio                             |
| **Color Pick**  | Batch 2: spinning spectrum disc with pointer, decelerating land, color paint result, audio            |
| **Guess Number**| Batch 2: spinning orb, win/loss state shadow, sparkle particles, audio                                |
| **RPS**         | Batch 2: side slam-in, winner scale, loser desaturate, push shake, particle burst, audio              |
| **Hi-Lo**       | Batch 2: card flip, win/loss border, streak counter with fire flair at 3+, audio                      |
| **Blackjack**   | Batch 3: real card render with rank+suit glyphs, staggered deal, hidden hole-card, chip-fly, 500-hand study runner |
| **Baccarat**    | Batch 3: squeeze reveal (700ms delay), bead road (6 rows × N cols), win/loss flash, particles, audio  |
| **Casino War**  | Batch 3: card slam from sides, Go-To-War tie option, win/loss flash, particles, audio                 |
| **Video Poker** | Batch 3: paytable with current-win highlight, real card render, hold-pin animation, deal stagger, audio |
| **Tower**       | Batch 4: parallax climb, current tile pulse, fall rotate-drop, cashout pulse, particles, audio        |
| **Chicken Cross**| Batch 4: chicken sprite (hop/splat states), car flyby chrome, cashout pulse, particles, audio        |
| **Lottery**     | Batch 4: tumbler shake + drop-by-drop ball reveal, hit cells gold scale-pop, sparkle particles, audio |
| **Keno**        | Batch 4: drop-by-drop drawn balls (220ms apart), hit cells scale-pop with green glow, audio           |
| **Sic Bo**      | Batch 4: cup shake → dice tumble out one by one, triple-win glow, win/loss flash, audio               |
| **Slots**       | Batch 4: true reel-by-reel stop (220ms per col), cluster-glow on winning cells, particles, audio       |
| **Roulette**    | Batch 4: real spinning wheel (37 segments, correct order), counter-rotating ball, decelerate to land, audio |

All 19 simulator games are now visually upgraded. Crash / Plinko / Mines retain their original engine polish from earlier passes; deeper Phaser/Matter overhauls remain as future work in the roadmap.
