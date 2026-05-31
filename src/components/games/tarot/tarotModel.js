import { nextRoll } from '../../../utils/fairRng'

export const TARGET_RTP = 0.96
export const MATCH_BONUS = 3

export const SUITS = {
    wands: { id: 'wands', name: 'Wands', mark: 'W', color: '#ff7a7c' },
    cups: { id: 'cups', name: 'Cups', mark: 'C', color: '#4cc9f0' },
    swords: { id: 'swords', name: 'Swords', mark: 'S', color: '#c7d1e0' },
    pentacles: { id: 'pentacles', name: 'Pentacles', mark: 'P', color: '#ffd166' },
}

export const DECK = [
    { id: 'fool', number: '0', name: 'The Fool', suit: 'wands', base: 0.6, keywords: 'Leap, variance' },
    { id: 'magician', number: 'I', name: 'The Magician', suit: 'wands', base: 1.6, keywords: 'Focus, action' },
    { id: 'priestess', number: 'II', name: 'High Priestess', suit: 'cups', base: 1.4, keywords: 'Hidden info' },
    { id: 'empress', number: 'III', name: 'The Empress', suit: 'pentacles', base: 1.4, keywords: 'Growth, value' },
    { id: 'emperor', number: 'IV', name: 'The Emperor', suit: 'swords', base: 1.6, keywords: 'Control' },
    { id: 'hierophant', number: 'V', name: 'The Hierophant', suit: 'pentacles', base: 1.0, keywords: 'Rules' },
    { id: 'lovers', number: 'VI', name: 'The Lovers', suit: 'cups', base: 1.8, keywords: 'Pair, choice' },
    { id: 'chariot', number: 'VII', name: 'The Chariot', suit: 'swords', base: 2.0, keywords: 'Push' },
    { id: 'strength', number: 'VIII', name: 'Strength', suit: 'wands', base: 2.4, keywords: 'Hold' },
    { id: 'hermit', number: 'IX', name: 'The Hermit', suit: 'pentacles', base: 0.8, keywords: 'Wait' },
    { id: 'wheel', number: 'X', name: 'Wheel of Fortune', suit: 'wands', base: 3.2, keywords: 'Swing' },
    { id: 'justice', number: 'XI', name: 'Justice', suit: 'swords', base: 1.2, keywords: 'Balance' },
    { id: 'hanged', number: 'XII', name: 'The Hanged Man', suit: 'cups', base: 0.4, keywords: 'Delay' },
    { id: 'death', number: 'XIII', name: 'Death', suit: 'swords', base: 0, keywords: 'Bust' },
    { id: 'temperance', number: 'XIV', name: 'Temperance', suit: 'cups', base: 1.2, keywords: 'Blend' },
    { id: 'devil', number: 'XV', name: 'The Devil', suit: 'wands', base: 0.2, keywords: 'Trap' },
    { id: 'tower', number: 'XVI', name: 'The Tower', suit: 'swords', base: 0, keywords: 'Collapse' },
    { id: 'star', number: 'XVII', name: 'The Star', suit: 'cups', base: 2.6, keywords: 'Hope' },
    { id: 'moon', number: 'XVIII', name: 'The Moon', suit: 'cups', base: 1.8, keywords: 'Unclear' },
    { id: 'sun', number: 'XIX', name: 'The Sun', suit: 'wands', base: 4.0, keywords: 'Bright win' },
    { id: 'judgement', number: 'XX', name: 'Judgement', suit: 'pentacles', base: 2.4, keywords: 'Reveal' },
    { id: 'world', number: 'XXI', name: 'The World', suit: 'pentacles', base: 5.0, keywords: 'Top omen' },
]

export function rawCardValue(card, pickedSuit) {
    return card.base * (card.suit === pickedSuit ? MATCH_BONUS : 1)
}

export function expectedRawForSuit(pickedSuit) {
    const weightedTotal = DECK.reduce((sum, card) => sum + rawCardValue(card, pickedSuit), 0)
    return (3 * weightedTotal) / DECK.length
}

export function expectedMultiplierForSuit(pickedSuit) {
    const normalizer = expectedRawForSuit(pickedSuit)
    return (3 * DECK.reduce((sum, card) => sum + rawCardValue(card, pickedSuit) * TARGET_RTP / normalizer, 0) / DECK.length)
}

export function contributionFor(card, pickedSuit) {
    const normalizer = expectedRawForSuit(pickedSuit)
    if (!normalizer) return 0
    return Number((rawCardValue(card, pickedSuit) * TARGET_RTP / normalizer).toFixed(3))
}

export function topContributionForSuit(pickedSuit) {
    return Math.max(...DECK.map(card => contributionFor(card, pickedSuit)))
}

export function drawSpread(rng = () => nextRoll('tarot').roll) {
    const pool = [...DECK]
    const spread = []
    for (let i = 0; i < 3; i += 1) {
        const roll = Math.max(0, Math.min(0.999999, Number(rng()) || 0))
        const idx = Math.floor(roll * pool.length)
        const [card] = pool.splice(idx, 1)
        spread.push(card)
    }
    return spread
}
