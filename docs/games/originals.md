# Originals

GamPo originals are arcade-style simulators with transparent math. Every game shows its expected value via the shared `EducationPanel`. RTPs noted below are targets, not guarantees; observed values drift in small samples.

## Crash

- Multiplier curve climbs from 1.00x with a hidden bust point.
- Bust point is sampled so that `P(bust > x) = (1 - houseEdge) / x` for `x >= 1`, giving 99% RTP.
- Strategy lesson: cashing out earlier raises hit frequency but lowers EV per wager (constant in expectation).

## Plinko

- Matter.js physics with configurable rows (8 to 16) and risk preset (Low, Medium, High).
- Payout buckets are symmetric; tail buckets carry rare large multipliers.
- Strategy lesson: more rows centralize the distribution; risk preset shifts payout shape, not RTP, which stays at 99%.

## Mines

- Configurable mines count on a 5x5 grid.
- Each safe pick increases payout by `(remaining_safe_total) / (remaining_safe - 1)` proportionally; cashout settles current multiplier.
- Strategy lesson: cumulative survival probability falls fast with more picks.

## Dino Run

- Phaser-based runner adapted into a wagering surface.
- Each obstacle pass uses a difficulty-derived survival probability.
- Strategy lesson: long survival streaks compound risk faster than intuition suggests.

## Dice

- `dicePayout(winChance, rtp)` returns `rtp / winChance`.
- Strategy lesson: lowering win chance raises payout linearly but EV stays at `-houseEdge * stake` per spin.

## Limbo

- Pick a target multiplier `m`; simulate a multiplier with hit probability `rtp / m`.
- Strategy lesson: target compresses the entire risk choice into one slider.

## Keno

- 40-ball pool, pick 1 to 10. Paytable in `simulationMath.kenoPayout`.
- Strategy lesson: most rounds are near-misses; paytable governs whether near-misses matter.

## Wheel

- Three risk presets (low, medium, high) with different segment payout vectors.
- Strategy lesson: average return is the same across presets within a single RTP target; variance differs sharply.

## Tower

- 8-row tower with `safeChance = 0.7` and `growth = 1.28x` per safe step.
- Strategy lesson: each safe step compounds risk; cashing out is the EV decision.

## Chicken Cross

- 12-lane crossing with three risk presets:
  - Easy: safe 0.85, growth 1.18x
  - Medium: safe 0.72, growth 1.32x
  - Hard: safe 0.58, growth 1.55x
- Strategy lesson: same shape as Tower with different curves.

## Hi-Lo Cards

- Single-deck higher/lower decision per card.
- `winChance` is computed exactly from current rank; payout is `0.96 / winChance`.
- Strategy lesson: payout reflects the visible card; the same direction has different value at different cards.

## Coin Flip

- 50/50 outcome at 1.96x payout.
- Strategy lesson: even fair-feeling 50/50 games lose value once edge is added.

## Rock Paper Scissors

- 1/3 win, 1/3 push, 1/3 loss; payout 2.91x.
- Strategy lesson: pushes feel close but EV is fixed.

## Guess Number

- 1-in-10 hit at 9.4x payout.
- Strategy lesson: rare hits demand large multipliers to keep RTP near 94%.

## Lottery Draw

- Pick 5 of 36; payout table awards rare full matches.
- Strategy lesson: jackpot games concentrate value into rare outcomes; near-misses feel meaningful but pay 0.
