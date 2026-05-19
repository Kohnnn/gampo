// Roulette layout helpers and bet definitions.
// European single-zero wheel.

export const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export function colorOf(n) {
    if (n === 0) return 'green'
    return RED_NUMBERS.has(n) ? 'red' : 'black'
}

// Racetrack groups (European)
export const VOISINS = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25] // 17 numbers
export const TIER = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33] // 12 numbers
export const ORPHELINS = [17, 34, 6, 1, 20, 14, 31, 9] // 8 numbers
export const ZERO_NEIGHBOURS = [12, 35, 3, 26, 0, 32, 15] // 7 numbers around zero

// Returns the neighbours-of-N (N + adjacent on each side, default ±2).
export function neighboursOf(n, span = 2) {
    const idx = WHEEL_ORDER.indexOf(n)
    if (idx < 0) return []
    const out = []
    for (let i = -span; i <= span; i++) {
        out.push(WHEEL_ORDER[(idx + i + WHEEL_ORDER.length) % WHEEL_ORDER.length])
    }
    return out
}

// Bet types -> { numbers: int[], payoutMultiplier: number (decimal "stake-back included") }
export function makeBet(type, params = {}) {
    switch (type) {
        case 'straight': return { numbers: [params.n], payout: 36 }
        case 'split': return { numbers: params.ns, payout: 18 }
        case 'street': return { numbers: params.ns, payout: 12 }
        case 'corner': return { numbers: params.ns, payout: 9 }
        case 'sixline': return { numbers: params.ns, payout: 6 }
        case 'red': return { numbers: [...RED_NUMBERS], payout: 2 }
        case 'black': return { numbers: Array.from({ length: 36 }, (_, i) => i + 1).filter(n => !RED_NUMBERS.has(n)), payout: 2 }
        case 'even': return { numbers: Array.from({ length: 18 }, (_, i) => (i + 1) * 2), payout: 2 }
        case 'odd': return { numbers: Array.from({ length: 18 }, (_, i) => i * 2 + 1), payout: 2 }
        case 'low': return { numbers: Array.from({ length: 18 }, (_, i) => i + 1), payout: 2 }
        case 'high': return { numbers: Array.from({ length: 18 }, (_, i) => i + 19), payout: 2 }
        case 'dozen1': return { numbers: Array.from({ length: 12 }, (_, i) => i + 1), payout: 3 }
        case 'dozen2': return { numbers: Array.from({ length: 12 }, (_, i) => i + 13), payout: 3 }
        case 'dozen3': return { numbers: Array.from({ length: 12 }, (_, i) => i + 25), payout: 3 }
        case 'col1': return { numbers: [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34], payout: 3 }
        case 'col2': return { numbers: [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35], payout: 3 }
        case 'col3': return { numbers: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36], payout: 3 }
        case 'voisins': return { numbers: VOISINS, payout: 36 / VOISINS.length }
        case 'tier': return { numbers: TIER, payout: 36 / TIER.length }
        case 'orphelins': return { numbers: ORPHELINS, payout: 36 / ORPHELINS.length }
        case 'zeroNeighbours': return { numbers: ZERO_NEIGHBOURS, payout: 36 / ZERO_NEIGHBOURS.length }
        case 'neighbours': {
            const ns = neighboursOf(params.n, params.span || 2)
            return { numbers: ns, payout: 36 / ns.length }
        }
        default: return { numbers: [], payout: 0 }
    }
}

// Standard 12x3 board number ordering
export const BOARD_NUMBERS = (() => {
    const rows = []
    for (let r = 3; r >= 1; r--) {
        const row = []
        for (let c = 0; c < 12; c++) {
            row.push(c * 3 + r)
        }
        rows.push(row)
    }
    return rows
})()
