// slotSparkline — build an SVG polyline path for a running net-profit
// bankroll trail from session history. Pure + testable.
//
// Input: history entries (most-recent-first, as useGameSession stores them),
// each with a numeric `profit`. We walk oldest→newest accumulating net profit
// and map to an SVG path within a [width,height] box, centered on the zero
// line so the player sees how far above/below break-even they are.

export function buildSparkline(history = [], { width = 120, height = 32, maxPoints = 40 } = {}) {
    const list = Array.isArray(history) ? history.slice(0, maxPoints).reverse() : []
    if (list.length === 0) {
        return { path: '', points: [], zeroY: height / 2, net: 0, min: 0, max: 0, last: 0 }
    }
    let cum = 0
    const cumulative = list.map(item => {
        cum += Number(item.profit) || 0
        return cum
    })
    const net = cum
    let min = Math.min(0, ...cumulative)
    let max = Math.max(0, ...cumulative)
    if (min === max) { min -= 1; max += 1 }
    const range = max - min
    const n = cumulative.length
    const x = (i) => (n === 1 ? width / 2 : (i / (n - 1)) * width)
    const y = (v) => height - ((v - min) / range) * height
    const points = cumulative.map((v, i) => ({ x: x(i), y: y(v) }))
    const path = points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
        .join(' ')
    return {
        path,
        points,
        zeroY: y(0),
        net,
        min,
        max,
        last: cumulative[cumulative.length - 1],
    }
}
