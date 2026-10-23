# Originals

GamPo originals are arcade-style simulators with transparent math. Every game shows its expected value via the shared `EducationPanel`. RTPs noted below are targets, not guarantees; observed values drift in small samples.

## Crash

- Multiplier curve climbs from 1.00x with a hidden bust point.
- Bust point is sampled so that `P(bust > x) = (1 - houseEdge) / x` for `x >= 1`, giving 99% RTP.
- Strategy lesson: cashing out earlier raises hit frequency but lowers EV per wager (constant in expectation).

## Plinko

- A deterministic canvas engine renders configurable rows (8 to 16) and risk presets (Low, Medium, High).
- Payout buckets are symmetric; tail buckets carry rare large multipliers.
- Expected value uses the complete weighted payout distribution and the selected ball's charged cost. Rounded buckets can differ slightly from the nominal 99% RTP.

## Mines

- Configurable mines count on a 5x5 grid.
- Each safe pick increases payout by `(remaining_safe_total) / (remaining_safe - 1)` proportionally; cashout settles current multiplier.
- Strategy lesson: cumulative survival probability falls fast with more picks.
- After bust, cashout, or the last safe pick, there is no next-pick quote.

## Dino Run

- A canvas runner presents difficulty-derived survival decisions.
- Education quotes the actual next jump's probability and gross return for the selected or active round stake, compared with cashout when available.
- Settled rounds do not retain an actionable next-jump quote.

## Dice

- `dicePayout(winChance, rtp)` returns `rtp / winChance`.
- Strategy lesson: lowering win chance raises payout linearly but EV stays at `-houseEdge * stake` per spin.
- The final numerical roll is displayed before result history, toast, and sound publication. Navigation preserves a pending settlement without replaying its visual effects.

## Limbo

- Pick a target multiplier `m`; simulate a multiplier with hit probability `rtp / m`.
- Strategy lesson: target compresses the entire risk choice into one slider.
- Only the decorative ring rotates; the primary result stays upright.

## Keno

- 40-ball pool, pick 1 to 10. Paytable in `simulationMath.kenoPayout`.
- Strategy lesson: most rounds are near-misses; paytable governs whether near-misses matter.

## Wheel

- Three risk presets (low, medium, high) with different segment payout vectors.
- Strategy lesson: average return is the same across presets within a single RTP target; variance differs sharply.

## Tower

- An 8-row tower with difficulty-specific survival probabilities and RTP-locked growth.
- Education compares the next climb's conditional return with the current cashout, using the actual round stake.

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
- The settled coin face remains bound to the recorded heads/tails outcome.

## Rock Paper Scissors

- 1/3 win, 1/3 push, 1/3 loss. The base win payout is 1.91×; applied Fun Mode changes the effective payout.
- A push returns the stake and reports a gross 1.00× in the result and history.

## Guess Number

- 1-in-10 hit at 9.4x payout.
- Strategy lesson: rare hits demand large multipliers to keep RTP near 94%.

## Lottery Draw

- Pick 5 of 36; payout table awards rare full matches.
- Strategy lesson: jackpot games concentrate value into rare outcomes; near-misses feel meaningful but pay 0.

## Diamonds and Tome of Life

- Diamonds' visible paytable derives from the same payout map, scale, and applied Fun setting as settlement.
- Tome starts at zero. Sun adds 0.60× and Moon adds 0.93×; Star doubles only the next page's contribution and does not stack.
- Tome's settled result is the credited gross return divided by the stake, including 0.00× busts and sub-stake cashouts. It remains visible after the round resets.
