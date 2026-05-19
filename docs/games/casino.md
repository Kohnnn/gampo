# Casino Tables

Card and table simulators. All settle locally against fake credits.

## Blackjack Trainer (`/blackjack`)

- Single-deck shuffle per hand for simplicity.
- Standard payouts: 1:1 on a win, 3:2 on a natural blackjack, push at 1:1 stake-back on tie.
- Dealer hits to 17 (no soft-17 toggle yet; on roadmap).
- Hint string adapts to player score and dealer up-card.

Roadmap: configurable deck count, penetration, dealer S17/H17, basic-strategy advisor, study-mode auto-runner. See `roadmap.md`.

## Baccarat Lab (`/baccarat`)

- Standard punto banco draw rules.
- Payouts: Banker 1.95x (5% commission), Player 2x, Tie 8x.
- True probabilities used for educational EV: Banker 0.4586, Player 0.4462, Tie 0.0952.
- House edge: ~1.06% on Banker, ~1.24% on Player, ~14.4% on Tie.

## Roulette (`/roulette`)

- Single-zero (European) wheel, 0 through 36.
- Bet types: Red, Black, Even, Odd, Low (1-18), High (19-36), Straight number.
- Even-money bets pay 2x; straight pays 36x.
- House edge stays at the single-zero baseline (~2.7%).

## Casino War (`/war`)

- Single-card duel per round.
- Player wins if the rank beats the dealer; tie pays 4x; loss otherwise.
- Win probability ~0.467, payout 2x. Going-to-war option not yet implemented.

## Sic Bo (`/sicbo`)

- Three dice; bet types Big (11-17 non-triple), Small (4-10 non-triple), Triple.
- Payouts: Big/Small at 2x, Triple at 31x.
- House edge: ~2.78% on Big/Small, much higher on Triple.

## Video Poker (`/videopoker`)

- 5-card draw with hold-then-draw flow.
- Paytable (multiplier on bet):
  - Royal Flush 250x
  - Straight Flush 50x
  - Four of a Kind 25x
  - Full House 9x
  - Flush 6x
  - Straight 4x
  - Three of a Kind 3x
  - Two Pair 2x
  - Jacks or Better 1x
- Strategy lesson: hold decisions move the distribution; the paytable sets long-run RTP near 98.5%.
