// Sic Bo bet definitions and payouts. Standard 3-dice (216 outcomes).

export function rollDice(rng) {
    return [Math.floor(rng() * 6) + 1, Math.floor(rng() * 6) + 1, Math.floor(rng() * 6) + 1]
}

function isTriple(d) { return d[0] === d[1] && d[1] === d[2] }
function total(d) { return d[0] + d[1] + d[2] }
function counts(d) { const c = {}; for (const v of d) c[v] = (c[v] || 0) + 1; return c }

export const SIC_BO_TOTAL_PAYOUTS = {
    4: 60, 5: 30, 6: 17, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6,
    13: 8, 14: 12, 15: 17, 16: 30, 17: 60,
}

export function evaluate(d, betKey, params = {}) {
    const t = total(d)
    const triple = isTriple(d)
    const c = counts(d)

    switch (betKey) {
        case 'big': return !triple && t >= 11 && t <= 17 ? 2 : 0
        case 'small': return !triple && t >= 4 && t <= 10 ? 2 : 0
        case 'odd': return !triple && t % 2 === 1 ? 2 : 0
        case 'even': return !triple && t % 2 === 0 ? 2 : 0
        case 'any-triple': return triple ? 31 : 0
        case 'specific-triple': return triple && d[0] === params.n ? 181 : 0
        case 'specific-double': return c[params.n] >= 2 ? 11 : 0
        case 'two-dice-combo':
            return c[params.a] && c[params.b] ? 7 : 0
        case 'single-dice': {
            const cnt = c[params.n] || 0
            if (cnt === 1) return 2
            if (cnt === 2) return 3
            if (cnt === 3) return 4
            return 0
        }
        case 'total': return SIC_BO_TOTAL_PAYOUTS[params.t] && t === params.t ? SIC_BO_TOTAL_PAYOUTS[params.t] : 0
        default: return 0
    }
}

export function trueProbability(betKey, params = {}) {
    let win = 0
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) {
        const d = [a, b, c]
        if (evaluate(d, betKey, params) > 0) win++
    }
    return win / 216
}
