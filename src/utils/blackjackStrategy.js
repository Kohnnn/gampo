export const BLACKJACK_STRATEGY_VERSION = 'gampo-blackjack-basic-v1'

export const BLACKJACK_STRATEGY_PROVENANCE = {
    source: 'Wizard of Odds Basic Strategy Calculator',
    retrieved: '2026-07-29',
    profiles: '1 deck, 2 decks, or 4-8 decks; S17/H17; DAS; late surrender; no peek/no hole card',
}

const ACTIONS = {
    H: ['hit'], S: ['stand'], P: ['split'], DH: ['double', 'hit'], DS: ['double', 'stand'],
    RH: ['surrender', 'hit'], RP: ['surrender', 'split'], RS: ['surrender', 'stand'],
    QH: ['split', 'hit'], QD: ['split', 'double', 'hit'], QS: ['split', 'stand'],
}

const UP_CARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const ROWS = [
    'H H H H H H H H H RH', 'H H H H H H H H H RH', 'H H H H H H H H H RH', 'H H H H H H H H H H',
    'H DH DH DH DH H H H H H', 'DH DH DH DH DH DH DH DH H H', 'DH DH DH DH DH DH DH DH H H', 'H H S S S H H H H RH',
    'S S S S S H H H H RH', 'S S S S S H H H RH RH', 'S S S S S H H H RH RH', 'S S S S S H H RH RH RH',
    'S S S S S S S S S RS', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S',
    'H H H DH DH H H H H H', 'H H H DH DH H H H H H', 'H H DH DH DH H H H H H', 'H H DH DH DH H H H H H',
    'H DH DH DH DH H H H H H', 'S DS DS DS DS S S H H H', 'S S S S S S S S S S', 'S S S S S S S S S S', 'S S S S S S S S S S',
    'QH QH P P P P H H H H', 'QH QH P P P P H H H RH', 'H H H QH QH H H H H H', 'DH DH DH DH DH DH DH DH H H',
    'QH P P P P H H H H RH', 'P P P P P P H H RH RH', 'P P P P P P P P RH RH', 'P P P P P S P P S S', 'S S S S S S S S S S', 'P P P P P P P P P H',
].map(row => row.split(' '))

const PROFILE_CHANGES = {
    H17_0: ['3:3:DH', '3:4:DH', '4:0:DH', '11:7:H', '17:2:DH', '18:2:DH', '21:0:DH', '23:4:DS', '26:1:P', '26:9:RH', '27:6:QH', '28:2:QH', '28:3:QD', '28:4:QD', '30:0:P', '30:5:QH', '31:6:QH', '31:8:RS'],
    S17_0: ['3:3:DH', '3:4:DH', '4:0:DH', '11:7:H', '17:2:DH', '18:2:DH', '21:0:DH', '22:9:S', '23:4:DS', '26:1:P', '27:6:QH', '28:2:QH', '28:3:QD', '28:4:QD', '30:0:P', '30:5:QH', '31:6:QH', '31:8:RS'],
    H17_1: ['4:0:DH', '11:7:H', '18:2:DH', '22:0:DS', '23:4:DS', '26:9:RH', '30:0:P', '30:5:QH', '31:6:QH'],
    S17_1: ['4:0:DH', '11:7:H', '30:0:P', '30:5:QH', '31:6:QH'],
    H17_2: ['22:0:DS', '23:4:DS', '26:9:RH'],
}

function profileRows(profileId) {
    const rows = ROWS.map(row => [...row])
    for (const change of PROFILE_CHANGES[profileId] || []) {
        const [row, column, code] = change.split(':')
        rows[Number(row)][Number(column)] = code
    }
    return rows
}

export function isSoftHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards || []) {
        if (card.rank === 'A') { aces += 1; total += 11 }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10
        else total += Number(card.rank) || 0
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
    return aces > 0 && total <= 21
}

export function dealerUpValue(card) {
    if (!card) return 0
    if (card.rank === 'A') return 11
    if (['K', 'Q', 'J', '10'].includes(card.rank)) return 10
    return Number(card.rank) || 0
}

export function scoreHand(cards) {
    let total = 0
    let aces = 0
    for (const card of cards || []) {
        if (card.rank === 'A') { aces += 1; total += 11 }
        else if (['K', 'Q', 'J'].includes(card.rank)) total += 10
        else total += Number(card.rank) || 0
    }
    while (total > 21 && aces > 0) { total -= 10; aces -= 1 }
    return total
}

function sourceProfile(decks, hitsSoft17) {
    return `${hitsSoft17 ? 'H17' : 'S17'}_${decks === 1 ? 0 : decks === 2 ? 1 : 2}`
}

function sourceRow(player) {
    const score = scoreHand(player)
    if (player?.length === 2 && dealerUpValue(player[0]) === dealerUpValue(player[1])) {
        const value = dealerUpValue(player[0])
        return value === 10 ? 34 : value === 11 ? 35 : 26 + value - 2
    }
    if (isSoftHand(player)) return score >= 13 && score <= 21 ? 17 + score - 13 : null
    return score >= 5 && score <= 21 ? score - 5 : null
}

function sourceCode(player, dealerCard, profileId) {
    const column = UP_CARDS.indexOf(dealerUpValue(dealerCard))
    const row = sourceRow(player)
    return column < 0 || row === null ? null : profileRows(profileId)[row][column]
}

export const HI_LO_DEVIATION_VERSION = 'hi-lo-i18-fab4-six-deck-s17-v1'

export const HI_LO_DEVIATION_PROVENANCE = {
    source: 'Wizard of Odds High-Low',
    retrieved: '2026-07-29',
    profiles: 'six decks; S17; DAS; late surrender; non-insurance I18/Fab 4 rows only',
}

const HI_LO_DEVIATIONS = [
    [16, 10, 0, 'stand'], ['10,10', 5, 5, 'split'], ['10,10', 6, 4, 'split'],
    [10, 10, 4, 'double'], [12, 3, 2, 'stand'], [12, 2, 3, 'stand'], [11, 11, 1, 'double'],
    [9, 2, 1, 'double'], [10, 11, 4, 'double'], [9, 7, 3, 'double'], [16, 9, 5, 'stand'],
    [13, 2, -1, 'stand'], [12, 4, 0, 'stand'], [12, 5, -2, 'stand'], [12, 6, -1, 'stand'],
    [13, 3, -2, 'stand'], [14, 10, 3, 'surrender'], [15, 10, 0, 'surrender'],
    [15, 9, 2, 'surrender'], [15, 11, 1, 'surrender'],
]

function deviationEntry(player, dealerCard) {
    const dealer = dealerUpValue(dealerCard)
    const hand = player?.length === 2 && dealerUpValue(player[0]) === 10 && dealerUpValue(player[1]) === 10
        ? '10,10'
        : scoreHand(player)
    return HI_LO_DEVIATIONS.find(([total, upCard]) => total === hand && upCard === dealer)
}

export function recommendHiLoDeviation({ player, dealerCard, trueCount, decks, hitsSoft17, doubleAfterSplit = true, lateSurrender = true } = {}) {
    const applicable = decks === 6 && !hitsSoft17 && doubleAfterSplit && lateSurrender
    const base = {
        strategyVersion: HI_LO_DEVIATION_VERSION,
        profileId: HI_LO_DEVIATION_VERSION,
        deviation: null,
    }
    if (!applicable) return {
        ...base,
        status: 'not-applicable',
        action: null,
        reason: 'This deviation profile requires six decks, S17, DAS, and late surrender.',
    }
    const entry = deviationEntry(player, dealerCard)
    if (!entry || !Number.isFinite(trueCount) || trueCount < entry[2]) return {
        ...base,
        status: 'not-applicable',
        action: null,
        reason: 'No verified deviation applies.',
    }
    const [hand, dealer, index, action] = entry
    return {
        ...base,
        status: 'available',
        action,
        reason: `Hi-Lo deviation: ${action} at true count ${index} or higher.`,
        deviation: { hand, dealer, index, action },
    }
}

export function recommendBlackjackAction({ player, dealerCard, decks = 4, hitsSoft17 = false, available = {} } = {}) {
    const profileId = sourceProfile(decks, hitsSoft17)
    if (!player?.length || !dealerCard) {
        return { status: 'unavailable', action: null, baselineAction: null, fallbackAction: null, reason: 'Deal first.', strategyVersion: BLACKJACK_STRATEGY_VERSION, profileId, deviation: null }
    }
    const baselineAction = sourceCode(player, dealerCard, profileId)
    const candidates = ACTIONS[baselineAction] || []
    const action = candidates.find(candidate => available[candidate] !== false) || null
    return {
        status: action ? 'available' : 'unavailable', action, baselineAction,
        fallbackAction: action && action !== candidates[0] ? action : null,
        reason: action ? `Basic strategy: ${action}.` : 'No recommended action is available.',
        strategyVersion: BLACKJACK_STRATEGY_VERSION, profileId, deviation: null,
    }
}

export function basicStrategyHint(player, dealerCard, options) {
    return recommendBlackjackAction({ player, dealerCard, ...options }).reason
}
