const SPECIFIC_COPY = {
    roulette: {
        objective: 'Place chips on inside numbers, outside groups, or racetrack sectors, then spin the single-zero wheel.',
        payout: 'Straight numbers pay 35:1, dozens and columns pay 2:1 profit, and even-money bets pay 1:1 profit. The zero removes value from every non-zero bet.',
        strategy: 'Compare hit rate to payout. Red/black feels close to fair but lands 18 of 37 times, so the 2.7% edge comes from the one green zero.',
        risk: 'Inside bets miss often and create spiky sessions. Outside bets settle more often but still carry the same long-run edge.',
    },
    blackjack: {
        objective: 'Beat the dealer without going over 21. Your decisions change EV, so the trainer shows the current basic-strategy hint.',
        payout: 'Regular wins return 2x including stake, pushes return 1x, blackjack returns 2.5x, surrender returns half, and insurance is a separate side bet.',
        strategy: 'Dealer up-card matters. Stand more often when the dealer is weak, hit more often against strong up-cards, and treat soft totals differently from hard totals.',
        risk: 'Bad hit/stand/double choices can erase the low theoretical edge. H17 and extra side bets usually increase variance.',
    },
    baccarat: {
        objective: 'Choose Banker, Player, Tie, pairs, or card-count side bets. The draw rules then run automatically.',
        payout: 'Banker pays 1.95x because commission is baked in, Player pays 2x, Tie pays 9x, pairs pay 12x, and Big/Small pay from total card count.',
        strategy: 'Banker is usually the lowest-edge main bet. Tie and pair bets are high-variance side bets with worse long-run value.',
        risk: 'Road maps show streak patterns but do not predict the next shoe result. Use them as history, not a forecasting model.',
    },
    tarot: {
        objective: 'Pick a suit, then reveal a Past, Present, and Future spread from a 22-card major-arcana deck.',
        payout: 'Each card contributes a multiplier from its omen value. Cards matching your chosen suit get a 3x raw omen boost, then the spread is normalized to the target RTP.',
        strategy: 'Suit choice changes which cards spike the spread but no suit has a hidden RTP advantage after normalization.',
        risk: 'Most spreads produce small returns. Big rounds need high-value cards and one or more suit matches.',
    },
    videopoker: {
        objective: 'Deal five cards, hold the best draw candidates, then draw once against the paytable.',
        payout: 'The paytable rewards made poker hands. Stronger made hands are rarer, so they carry larger multipliers.',
        strategy: 'Hold made value first, then high-equity draws. The same draw can be good or bad depending on the exact paytable.',
        risk: 'Many rounds are no-pair misses. Long-run value depends more on draw decisions than on any single deal.',
    },
    hilo: {
        objective: 'Predict whether the next card is higher or lower than the visible card, then cash out or continue.',
        payout: 'Multipliers grow as you chain correct calls. Middle cards are harder because both directions have similar risk.',
        strategy: 'Low cards favor higher, high cards favor lower, and ties or extreme ranks should be treated according to the displayed chance.',
        risk: 'Each extra call compounds failure probability. Cashout trades upside for survival.',
    },
    war: {
        objective: 'Your card battles the dealer card. Higher rank wins; ties follow the casino-war resolution.',
        payout: 'Single-card wins return near even money. Tie handling creates the edge and adds short-run variance.',
        strategy: 'There is little decision depth compared with blackjack. Treat it as a simple rank-distribution simulator.',
        risk: 'The game feels close because many cards are near in rank, but ties and rules still define the long-run cost.',
    },
    cases: {
        objective: 'Choose a case, set rows, and open a simulated drop reel built from weighted item pools.',
        payout: 'Common items hit often and rare items drive the long tail. Case EV comes from item value multiplied by drop probability.',
        strategy: 'Look at category price range, item pool, and recent value rather than only the headline top prize.',
        risk: 'Most opens lose value. High-value cases can have large real-looking prices, but this simulator uses practice credits only.',
    },
    slots: {
        objective: 'Pick a slot template, wager, spin, and inspect the deterministic payline/ways/cluster result.',
        payout: 'Wins depend on the selected template: lines, ways, scatters, cascades, feature buys, and bonus contracts all change volatility.',
        strategy: 'RTP describes long-run return, while volatility describes how rough the path can feel before that average emerges.',
        risk: 'Bonus rounds and high multipliers are rare. A low hit frequency can still have the same RTP as a frequent small-win game.',
    },
}

const CATEGORY_COPY = {
    'Arcade originals': {
        objective: 'Set the round parameters, place a practice-credit stake, and resolve the arcade-style risk choice.',
        payout: 'The visible multiplier converts hit chance into return. Higher upside normally means lower survival probability.',
        strategy: 'Watch how each extra step, reveal, or target raises variance before you chase a larger number.',
        risk: 'Short sessions can look streaky. The displayed RTP is a long-run average, not a promise for the next play.',
    },
    'Table math': {
        objective: 'Choose a table bet and resolve it against the displayed probability model.',
        payout: 'Payouts are tied to hit frequency with house edge removed from fair odds.',
        strategy: 'Compare win chance, payout, and EV per play before raising bet size.',
        risk: 'Table games can feel smooth on even-money bets, but repeated negative-EV trials compound losses.',
    },
    'Decision games': {
        objective: 'Make a sequence of choices where the next action changes expected value.',
        payout: 'Returns depend on both the random draw and your decision quality.',
        strategy: 'Use the on-screen hints as a baseline, then compare how different choices change risk.',
        risk: 'A good decision can still lose in the short run; the point is to improve the average over many rounds.',
    },
    'Card room': {
        objective: 'Play a card-based simulator using practice credits and inspect how hand distribution affects payout.',
        payout: 'Card ranks, suits, and hand categories determine return. Rare combinations carry larger multipliers.',
        strategy: 'Separate result quality from decision quality; a bad beat is not proof of a bad choice.',
        risk: 'Card games mix visible information with hidden draw variance, so history is useful context but not a guarantee.',
    },
    'Lottery math': {
        objective: 'Pick numbers or entries, draw the result, and compare the rarity of hits to the paytable.',
        payout: 'Most value sits in rare outcomes. Small hits are frequent enough to keep the session moving.',
        strategy: 'Treat near misses as misses. Only exact paytable conditions change EV.',
        risk: 'Low hit frequency creates long cold stretches even when the math is working as designed.',
    },
    Slots: {
        objective: 'Spin a themed reel model and inspect how the template evaluates wins.',
        payout: 'Lines, ways, clusters, scatters, and feature states all route to different payout rules.',
        strategy: 'Read the RTP, volatility, and feature contract before judging a template from a few spins.',
        risk: 'Large bonuses are intentionally rare, so bankroll swings can be much larger than the base hit rate suggests.',
    },
}

export function getGameEducation(definition = {}) {
    const specific = SPECIFIC_COPY[definition.id]
    const category = CATEGORY_COPY[definition.category] || CATEGORY_COPY['Arcade originals']
    const name = definition.name || 'This simulator'
    return {
        objective: specific?.objective || category.objective.replace('the arcade-style', `${name} style`),
        payout: specific?.payout || category.payout,
        strategy: specific?.strategy || category.strategy,
        risk: specific?.risk || category.risk,
    }
}
