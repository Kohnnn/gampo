// Heuristic flop-texture classifier. Maps a 3+-card board to a coarse texture key
// used to select the right postflop chart bucket.
//
// Input cards are engine format: ['Ks', '7d', '2c'] etc.
// Texture keys (kept small for v1):
//   - 'monotone'        all three same suit
//   - 'two-tone'        two of one suit, one different
//   - 'rainbow'         three different suits
//   - 'paired'          one pair on board (overrides flush family on coarse axis)
//   - 'high-dry'        A/K/Q-high, no flush draw, no straight draw, no pair (subset of two-tone/rainbow)
//   - 'middling'        T/9/8-high
//   - 'low-connected'   sub-T high with two cards within 4 ranks of each other
//   - 'low-disconnected'
//
// Output: { suit: 'mono'|'two-tone'|'rainbow', rank: 'high'|'middling'|'low',
//           paired: boolean, connected: boolean, key: string }

const RANK_VALUE = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }

function valueOf(card) {
    return RANK_VALUE[card[0].toUpperCase()] || 0
}
function suitOf(card) {
    return card[1].toLowerCase()
}

export function classify(boardCards) {
    if (!boardCards || boardCards.length < 3) return null
    const cards = boardCards.slice(0, 5)
    const ranks = cards.slice(0, 3).map(valueOf).sort((a, b) => b - a)
    const suits = cards.slice(0, 3).map(suitOf)
    const suitCounts = suits.reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {})
    const maxSuit = Math.max(...Object.values(suitCounts))
    const suit = maxSuit === 3 ? 'mono' : maxSuit === 2 ? 'two-tone' : 'rainbow'
    const paired = ranks[0] === ranks[1] || ranks[1] === ranks[2]
    const high = ranks[0]
    const rank = high >= 12 ? 'high' : high >= 9 ? 'middling' : 'low'
    // Connected means top three within 4 ranks of each other (gappy straight draws).
    const connected = (ranks[0] - ranks[2]) <= 4
    const key = `${suit}-${paired ? 'paired-' : ''}${rank}${connected ? '-conn' : ''}`
    return { suit, rank, paired, connected, key, top: ranks[0] }
}
