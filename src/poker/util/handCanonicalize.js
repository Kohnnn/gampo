// Canonicalize a 2-card hole hand into the 169-cell preflop grid key.
// Card format is the engine's: 2-char "Rs" with rank in 2..9,T,J,Q,K,A and suit s,h,d,c.
//
// Output:
//   - Pair:        "AA", "KK", ... "22"
//   - Suited:      "AKs", "76s", ... "T9s"
//   - Offsuit:     "AKo", "76o", ... "T9o"
//
// The grid is rendered as a 13x13 matrix with ranks A..2 across both axes.
// Convention used by AHTOOOXA / GTO Wizard: pairs on the diagonal, suited
// hands above the diagonal, offsuit below.

const RANK_ORDER = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const RANK_INDEX = Object.fromEntries(RANK_ORDER.map((r, i) => [r, i]))

export function rankIdx(rank) {
    return RANK_INDEX[rank.toUpperCase()] ?? -1
}

export const ALL_RANKS = RANK_ORDER

// Accepts either ['Ks', 'Qh'] or ['KS', 'QH'] etc.
export function canonical(hole) {
    if (!hole || hole.length < 2) return null
    const a = String(hole[0])
    const b = String(hole[1])
    if (a.length < 2 || b.length < 2) return null
    const rA = a[0].toUpperCase()
    const rB = b[0].toUpperCase()
    const sA = a[1].toLowerCase()
    const sB = b[1].toLowerCase()
    const idxA = rankIdx(rA)
    const idxB = rankIdx(rB)
    if (idxA < 0 || idxB < 0) return null
    if (rA === rB) return `${rA}${rA}`
    // Higher rank first.
    const [hi, lo] = idxA < idxB ? [rA, rB] : [rB, rA]
    const suited = sA === sB
    return `${hi}${lo}${suited ? 's' : 'o'}`
}

// Build the canonical 169 ordered list (used for chart fallback).
export function allHandCodes() {
    const out = []
    for (let row = 0; row < 13; row++) {
        for (let col = 0; col < 13; col++) {
            const rHi = RANK_ORDER[row]
            const rLo = RANK_ORDER[col]
            if (row === col) out.push(`${rHi}${rHi}`)
            else if (row < col) out.push(`${rHi}${rLo}s`)
            else out.push(`${rLo}${rHi}o`)
        }
    }
    return out
}

// Position of a hand code on the 13x13 grid (row, col).
// Pairs sit on the diagonal, suited above (row<col), offsuit below.
export function gridCellFor(code) {
    if (!code) return null
    if (code.length === 2) {
        // Pair
        const idx = rankIdx(code[0])
        return { row: idx, col: idx }
    }
    if (code.length !== 3) return null
    const r1 = rankIdx(code[0])
    const r2 = rankIdx(code[1])
    if (r1 < 0 || r2 < 0) return null
    const suited = code[2] === 's'
    if (suited) return { row: Math.min(r1, r2), col: Math.max(r1, r2) }
    return { row: Math.max(r1, r2), col: Math.min(r1, r2) }
}

// Inverse: return the code at row/col on the 13x13 grid.
export function codeAt(row, col) {
    const rHi = RANK_ORDER[row]
    const rLo = RANK_ORDER[col]
    if (row === col) return `${rHi}${rHi}`
    if (row < col) return `${rHi}${rLo}s`
    return `${rLo}${rHi}o`
}
