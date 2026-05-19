// Re-export internals for testability via small isolated module.
// Mirrors logic in SimulatorGame.jsx's blackjack hint engine.

export function isSoftHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards) {
        if (card.rank === 'A') { aces += 1; total += 11 }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10
        else total += Number(card.rank)
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
    return aces > 0 && total <= 21
}

export function dealerUpValue(card) {
    if (!card) return 0
    if (card.rank === 'A') return 11
    if (['K', 'Q', 'J', '10'].includes(card.rank)) return 10
    return Number(card.rank)
}

export function scoreHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards) {
        if (card.rank === 'A') { aces += 1; total += 11 }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10
        else total += Number(card.rank)
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
    return total
}

export function basicStrategyHint(player, dealerCard) {
    if (!player || player.length === 0 || !dealerCard) return 'Hint: deal first.'
    const score = scoreHand(player)
    const up = dealerUpValue(dealerCard)
    if (score >= 17) return 'Stand: hard 17+ stays.'
    if (score <= 8) return 'Hit: weak hard total has nothing to lose.'
    if (isSoftHand(player)) {
        if (score >= 19) return 'Stand: soft 19+ is strong.'
        if (score === 18) return up >= 9 ? 'Hit: soft 18 vs strong dealer.' : 'Stand: soft 18 vs weak dealer.'
        return 'Hit: soft hands ride aces upward.'
    }
    if (score >= 13 && score <= 16) {
        return up >= 7 ? `Hit: hard ${score} vs ${up} is loss-equity, hit.` : `Stand: hard ${score} vs ${up} dealer probably busts.`
    }
    if (score === 12) return up >= 4 && up <= 6 ? 'Stand: hard 12 vs 4-6 hopes dealer busts.' : 'Hit: hard 12 elsewhere.'
    if (score === 11) return 'Hit: hard 11 always wants another card.'
    if (score === 10) return up >= 10 ? 'Hit: hard 10 vs 10/A.' : 'Hit: hard 10 wants a strong follow-up.'
    if (score === 9) return up >= 3 && up <= 6 ? 'Hit: hard 9 vs 3-6 (no double here).' : 'Hit: hard 9.'
    return 'Hit: continue building total.'
}
