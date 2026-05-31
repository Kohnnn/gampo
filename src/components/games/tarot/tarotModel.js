import { nextRoll } from '../../../utils/fairRng'
import { TAROT_CARD_BACK, TAROT_DECK } from '../../../data/tarotDeck.generated'

export const TARGET_RTP = 0.96
export const MATCH_BONUS = 2.5
export const OFF_SUIT_FACTOR = 0.45
export const TAROT_BACK_IMAGE = TAROT_CARD_BACK

export const SUITS = {
    wands: { id: 'wands', name: 'Wands', mark: 'W', color: '#ff7a7c' },
    cups: { id: 'cups', name: 'Cups', mark: 'C', color: '#4cc9f0' },
    swords: { id: 'swords', name: 'Swords', mark: 'S', color: '#c7d1e0' },
    pentacles: { id: 'pentacles', name: 'Pentacles', mark: 'P', color: '#ffd166' },
    major: { id: 'major', name: 'Major Arcana', mark: 'M', color: '#b478ff' },
}

export const MINOR_RANK_BASE = {
    Ace: 1.4,
    1: 1.4,
    2: 0.2,
    3: 0.25,
    4: 0.35,
    5: 0.45,
    6: 0.6,
    7: 0.75,
    8: 0.95,
    9: 1.15,
    10: 1.35,
    Page: 1.6,
    Knight: 1.9,
    Queen: 2.3,
    King: 2.8,
}

export const MAJOR_RAW_BY_NAME = {
    fool: 0.6,
    magician: 2.2,
    highpriestess: 1.8,
    empress: 2.2,
    emperor: 2.3,
    hierophant: 1.2,
    lovers: 2.8,
    chariot: 3.2,
    strength: 3.6,
    hermit: 0.9,
    wheeloffortune: 5.0,
    justice: 1.5,
    hangedman: 0.3,
    death: 0,
    temperance: 1.7,
    devil: 0.2,
    tower: 0,
    star: 4.2,
    moon: 2.0,
    sun: 8.0,
    judgement: 5.5,
    world: 10.0,
}

const POSITION_READINGS = {
    Past: 'sets the memory behind this wager',
    Present: 'shows the pressure at the table now',
    Future: 'points to the result path ahead',
}

function normalizeMajorName(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/^the\s+/, '')
        .replace(/[^a-z0-9]/g, '')
}

function minorRankBase(rank) {
    const key = String(rank || '')
    return MINOR_RANK_BASE[key] ?? 0
}

function majorBase(card) {
    return MAJOR_RAW_BY_NAME[normalizeMajorName(card?.name)] ?? 0
}

function displayRank(card) {
    if (!card) return ''
    if (card.arcana === 'major') return card.rank
    if (String(card.rank) === '1') return 'Ace'
    return card.rank
}

export const DECK = TAROT_DECK.map(card => ({
    ...card,
    displayRank: displayRank(card),
    base: card.arcana === 'major' ? majorBase(card) : minorRankBase(card.rank),
    isMajor: card.arcana === 'major',
}))

export function tarotCardImage(card) {
    return card?.image || ''
}

export function tarotCardImageByIndex(index) {
    return DECK[index]?.image || ''
}

export function rawCardValue(card, pickedSuit) {
    if (!card) return 0
    if (card.arcana === 'major') return majorBase(card)
    const base = minorRankBase(card.rank)
    return base * (card.suit === pickedSuit ? MATCH_BONUS : OFF_SUIT_FACTOR)
}

export function expectedRawForSuit(pickedSuit) {
    const weightedTotal = DECK.reduce((sum, card) => sum + rawCardValue(card, pickedSuit), 0)
    return (3 * weightedTotal) / DECK.length
}

export function expectedMultiplierForSuit(pickedSuit) {
    const normalizer = expectedRawForSuit(pickedSuit)
    if (!normalizer) return 0
    return 3 * DECK.reduce((sum, card) => sum + rawCardValue(card, pickedSuit) * TARGET_RTP / normalizer, 0) / DECK.length
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

export function readingFor(entry, position = 'Present', pickedSuit = 'wands') {
    const card = entry?.card || entry
    if (!card) return null
    const contribution = entry?.contribution ?? contributionFor(card, pickedSuit)
    const matched = card.arcana !== 'major' && card.suit === pickedSuit
    const suitName = SUITS[card.suit]?.name || 'Major Arcana'
    const omen = card.arcana === 'major'
        ? `${card.name} is a Major Arcana swing with a ${contribution.toFixed(2)}x contribution.`
        : matched
            ? `${card.name} matches ${SUITS[pickedSuit].name} and earns the suit bonus.`
            : `${card.name} is ${suitName}, so it pays the off-suit omen value.`
    return {
        position,
        title: `${position}: ${card.name}`,
        subtitle: POSITION_READINGS[position] || POSITION_READINGS.Present,
        arcana: card.arcana,
        suit: suitName,
        rank: displayRank(card),
        symbols: card.symbols,
        description: card.description,
        contribution,
        omen,
    }
}
