export function latestNonTieSide(outcomes = []) {
    for (let i = outcomes.length - 1; i >= 0; i -= 1) {
        const outcome = outcomes[i]
        if (outcome === 'B') return 'banker'
        if (outcome === 'P') return 'player'
    }
    return null
}

export function lastManualSide(lastChips = {}) {
    if (Number(lastChips.banker) > 0) return 'banker'
    if (Number(lastChips.player) > 0) return 'player'
    return null
}

export function deriveBaccaratAutoBets({
    currentBets = {},
    lastChips = {},
    outcomes = [],
    betAmount = 0,
} = {}) {
    const currentStake = Object.values(currentBets).reduce((sum, value) => sum + (Number(value) || 0), 0)
    if (currentStake > 0) {
        return { bets: { ...currentBets }, source: 'manual', side: null }
    }

    const amount = Number(betAmount) || 0
    if (amount <= 0) return { bets: {}, source: 'none', side: null }

    const roadSide = latestNonTieSide(outcomes)
    if (roadSide) return { bets: { [roadSide]: amount }, source: 'latest-road', side: roadSide }

    const fallbackSide = lastManualSide(lastChips)
    if (fallbackSide) return { bets: { [fallbackSide]: amount }, source: 'last-manual', side: fallbackSide }

    return { bets: {}, source: 'none', side: null }
}

export function resolveBaccaratTicket({ currentBets = {}, lastChips = {}, outcomes = [], mode, betAmount } = {}) {
    let bets = currentBets
    let stake = Object.values(bets).reduce((sum, amount) => sum + (amount || 0), 0)
    let source = 'manual'
    if (stake <= 0 && mode === 'auto') {
        const derived = deriveBaccaratAutoBets({ currentBets, lastChips, outcomes, betAmount })
        bets = derived.bets
        source = derived.source === 'none' ? 'manual' : derived.source
        stake = Object.values(bets).reduce((sum, amount) => sum + (amount || 0), 0)
    } else if (stake <= 0 && Object.keys(lastChips).length && (mode === 'manual' || mode === 'strategy')) {
        bets = lastChips
        source = 'last-manual'
        stake = Object.values(bets).reduce((sum, amount) => sum + (amount || 0), 0)
    }
    return { bets, stake, source }
}
