// Baccarat road derivations (Big Road, Big Eye Boy, Small Road, Cockroach Pig).
// Inputs are 'B' (banker), 'P' (player), 'T' (tie) outcomes oldest-first.

// Big Road: build columns where each column groups consecutive same-side outcomes.
// Ties hang on the last cell.
export function buildBigRoad(outcomes) {
    const cols = []
    let cur = null
    for (const o of outcomes) {
        if (o === 'T') {
            if (!cur) {
                cur = { side: 'T', items: [{ type: 'tie' }] }
                cols.push(cur)
            } else {
                cur.items[cur.items.length - 1].tie = true
            }
            continue
        }
        if (!cur || cur.side !== o) {
            cur = { side: o, items: [{ type: o, tie: false }] }
            cols.push(cur)
        } else {
            cur.items.push({ type: o, tie: false })
        }
    }
    return cols
}

export function latestBigRoadPosition(cols = []) {
    for (let ci = cols.length - 1; ci >= 0; ci -= 1) {
        const col = cols[ci]
        if (col?.items?.length) {
            return { colIndex: ci, rowIndex: col.items.length - 1, item: col.items[col.items.length - 1] }
        }
    }
    return null
}

export function tailRoadColumns(cols = [], maxColumns = 32) {
    const offset = Math.max(0, cols.length - maxColumns)
    return { columns: cols.slice(offset), offset }
}

export function tailRoadDots(dots = [], maxDots = 36) {
    const offset = Math.max(0, dots.length - maxDots)
    return { dots: dots.slice(offset), offset }
}

// Derived roads (Big Eye / Small / Cockroach) compare a position N columns back
// and either look "regular" (red dot / round) or "different" (blue dot).
function derivedFromBig(cols, lookback) {
    const dots = []
    // Walk Big Road by column then row, starting where we have history N+1 columns back.
    for (let ci = lookback; ci < cols.length; ci++) {
        const col = cols[ci]
        for (let ri = 0; ri < col.items.length; ri++) {
            // Compare with column ci - lookback at the same row.
            const past = cols[ci - lookback]
            if (!past) continue
            // "Red" if structure repeats; "Blue" if different.
            const dot = (ri === 0)
                ? (past.items.length === cols[ci - 1]?.items.length ? 'red' : 'blue')
                : (past.items.length > ri ? 'red' : 'blue')
            dots.push(dot)
        }
    }
    return dots
}

export function buildBigEyeBoy(cols) { return derivedFromBig(cols, 1) }
export function buildSmallRoad(cols) { return derivedFromBig(cols, 2) }
export function buildCockroachPig(cols) { return derivedFromBig(cols, 3) }
