// Independent Chip Model (Malmuth-Harville) equity for SNG study aid.
// Given current chip stacks and the prize payouts (best place first), returns
// each stack's expected prize equity in credits. Player study aid only — bots
// do not use this for push/fold decisions.

export function icmEquity(stacks, payouts) {
    const n = stacks.length
    const total = stacks.reduce((a, b) => a + b, 0)
    if (n === 0 || total <= 0) return stacks.map(() => 0)
    const pays = payouts.slice(0, n)
    const paidPlaces = pays.length
    const equity = new Array(n).fill(0)

    // Walk finishing orders best-first. P(next finisher is i) = stack_i / remTotal.
    // Accumulate prize for each paid place along every path.
    function recurse(remaining, remTotal, place, prob) {
        if (place >= paidPlaces || remaining.length === 0 || remTotal <= 0) return
        for (const i of remaining) {
            const pathProb = prob * (stacks[i] / remTotal)
            equity[i] += pathProb * pays[place]
            if (place + 1 < paidPlaces && remaining.length > 1) {
                recurse(remaining.filter(x => x !== i), remTotal - stacks[i], place + 1, pathProb)
            }
        }
    }

    recurse(stacks.map((_, i) => i), total, 0, 1)
    return equity
}
