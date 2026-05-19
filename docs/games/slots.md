# Slots

GamPo ships two slot variants and three themes. There is no licensed art; every visual is built from CSS gradients and short text labels.

## Variants

### 5x3 line-pay

- Grid: 5 columns x 3 rows = 15 cells.
- Paylines: 3 horizontal + 2 V-shapes = 5 lines.
- A line wins if every cell on the line shares the same symbol id and that symbol's `multiplier > 0`.
- Multiple lines accumulate.

### 6x4 cluster-pay

- Grid: 6 columns x 4 rows = 24 cells.
- A cluster of 6 or more matching symbols (anywhere on the grid) wins. Each match earns `symbol.multiplier * (count / 6)`, summed across symbols.
- Encourages dense reels and soft volatility tweaks.

## Themes

| Theme   | Top symbol | Bottom symbol | Vibe                                          |
|---------|------------|---------------|-----------------------------------------------|
| Classic | 7          | -             | Retro red/black contrast.                     |
| Cyber   | CORE       | -             | Magenta/blue gradients, neon highlights.      |
| Mythic  | RUNE       | -             | Gold/violet/green, fantasy palette.           |

## Symbol weights

Default weight table (Classic):

| Symbol | Weight | Multiplier |
|--------|--------|------------|
| 7      | 2      | 50         |
| STAR   | 5      | 15         |
| BAR    | 8      | 8          |
| GEM    | 12     | 4          |
| GC     | 18     | 2          |
| -      | 35     | 0          |

Cyber and Mythic mirror the same weights with different labels.

## Animations

- The grid plays a `slotSpin` keyframe on every spin: a small Y-translate plus rotateX with a brief blur. Each cell receives a 60ms delay per column to suggest reels stopping left-to-right.
- Spin button is disabled mid-animation to prevent double-fires.

## Observed RTP

The simulator tracks `wagered` and `returned` for the current session and exposes the running RTP next to the bet panel. Variance can be very wide in small samples.

## Removing assets

Themes and weights live in `SimulatorGame.jsx` near `function SlotsSimulator`. To swap or remove a theme, delete its entry from the `themes` object and the matching CSS rules in `SimulatorGame.css` (`.slots-field.theme-*`). No external asset files are required.
