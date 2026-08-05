import { scoreBlackjackHand } from '../../../utils/simulationMath'

export const MAX_BLACKJACK_HANDS = 4

export function blackjackCardValue(card) {
    if (!card) return 0
    if (card.rank === 'A') return 11
    if (['K', 'Q', 'J', '10'].includes(card.rank)) return 10
    return Number(card.rank) || 0
}

export function makeBlackjackHand({
    cards = [],
    wager = 0,
    status = 'active',
    doubled = false,
    surrendered = false,
    isSplitAces = false,
    fromSplit = false,
    // Hand DOM id, not payout-deciding — payout is decided by scoreBlackjackHand.
    id = crypto.randomUUID(),
} = {}) {
    return { id, cards, wager, status, doubled, surrendered, isSplitAces, fromSplit }
}

export function isNaturalBlackjack(hand) {
    return Boolean(hand && !hand.fromSplit && hand.cards?.length === 2 && scoreBlackjackHand(hand.cards) === 21)
}

export function canSplitHand(hand, hands = [], maxHands = MAX_BLACKJACK_HANDS) {
    if (!hand || hand.status !== 'active') return false
    if ((hands?.length || 0) >= maxHands) return false
    if (hand.cards?.length !== 2) return false
    return blackjackCardValue(hand.cards[0]) === blackjackCardValue(hand.cards[1])
}

export function canDoubleHand(hand) {
    return Boolean(hand && hand.status === 'active' && hand.cards?.length === 2 && !hand.isSplitAces)
}

export function canSurrenderHand(hand, activeHandIndex = 0, hands = []) {
    return Boolean(
        hand
        && hand.status === 'active'
        && hand.cards?.length === 2
        && activeHandIndex === 0
        && (hands?.length || 0) === 1
        && !hand.fromSplit,
    )
}

export function splitBlackjackHand(hand, firstCard, secondCard) {
    const [left, right] = hand?.cards || []
    const splitAces = left?.rank === 'A' && right?.rank === 'A'
    const status = splitAces ? 'standing' : 'active'
    return [
        makeBlackjackHand({
            cards: [left, firstCard].filter(Boolean),
            wager: hand.wager,
            status,
            isSplitAces: splitAces,
            fromSplit: true,
            id: `${hand.id}-a`,
        }),
        makeBlackjackHand({
            cards: [right, secondCard].filter(Boolean),
            wager: hand.wager,
            status,
            isSplitAces: splitAces,
            fromSplit: true,
            id: `${hand.id}-b`,
        }),
    ]
}

export function nextPlayableHandIndex(hands = [], startIndex = -1) {
    return hands.findIndex((hand, index) => index > startIndex && hand.status === 'active')
}

export function settleBlackjackHands(hands = [], dealer = [], insurance = 0) {
    const dealerScore = scoreBlackjackHand(dealer)
    const dealerBlackjack = dealer.length === 2 && dealerScore === 21
    const settledHands = hands.map(hand => {
        const playerScore = scoreBlackjackHand(hand.cards)
        let multiplier = 0
        let label = 'Loss'
        if (hand.surrendered || hand.status === 'surrendered') {
            multiplier = 0.5
            label = 'Surrender'
        } else if (playerScore > 21 || dealerBlackjack) {
            multiplier = 0
            label = playerScore > 21 ? 'Bust' : 'Loss'
        } else if (dealerScore > 21 || playerScore > dealerScore) {
            multiplier = isNaturalBlackjack(hand) ? 2.5 : 2
            label = isNaturalBlackjack(hand) ? 'Blackjack' : 'Win'
        } else if (playerScore === dealerScore) {
            multiplier = 1
            label = 'Push'
        }
        const returnAmount = Math.round((hand.wager * multiplier) * 100) / 100
        const profit = Math.round((returnAmount - hand.wager) * 100) / 100
        return { ...hand, status: 'settled', result: { label, multiplier, returnAmount, profit, playerScore, dealerScore } }
    })
    const handReturn = settledHands.reduce((sum, hand) => sum + (hand.result?.returnAmount || 0), 0)
    const wagered = hands.reduce((sum, hand) => sum + (hand.wager || 0), 0)
    const insuranceReturn = dealerBlackjack && insurance > 0 ? insurance * 3 : 0
    const totalReturn = Math.round((handReturn + insuranceReturn) * 100) / 100
    const profit = Math.round((totalReturn - wagered - (Number(insurance) || 0)) * 100) / 100
    return { hands: settledHands, dealerScore, dealerBlackjack, totalReturn, profit, wagered, insuranceReturn }
}
