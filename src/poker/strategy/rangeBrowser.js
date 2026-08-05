// Pure presentation mapping for the static Range Browser.
// Reference-only view over committed chart data. Independent of any live hand.
// This data is unreviewed legacy material: it is never presented as advice.

const RANKS = Object.freeze(['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'])
const ACTION_ORDER = Object.freeze(['raise', 'call', 'check', 'fold'])

export const BROWSER_STATUSES = Object.freeze(['ready', 'empty', 'loading', 'error'])
export const RANGE_DISCLOSURE = 'Unreviewed reference data. Not advice, and not tied to your current hand.'

function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function readOnce(target, key) {
    try {
        return { ok: true, value: target[key] }
    } catch {
        return { ok: false, value: null }
    }
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.length > 0
}

function frame(status, extra = {}) {
    return Object.freeze({
        status,
        provenanceKind: 'legacy-local',
        reviewed: false,
        prescriptive: false,
        disclosure: RANGE_DISCLOSURE,
        positions: extra.positions ?? Object.freeze([]),
        scenarios: extra.scenarios ?? Object.freeze([]),
        cells: extra.cells ?? Object.freeze([]),
        sizeLabel: extra.sizeLabel ?? null,
        testId: `range-browser-${status}`,
    })
}

export function listPositions(chart) {
    if (!plain(chart)) return Object.freeze([])
    const positions = readOnce(chart, 'positions')
    if (!positions.ok || !plain(positions.value)) return Object.freeze([])
    return Object.freeze(Object.keys(positions.value).filter(nonEmptyString))
}

export function listScenarios(chart, position) {
    if (!plain(chart) || !nonEmptyString(position)) return Object.freeze([])
    const positions = readOnce(chart, 'positions')
    if (!positions.ok || !plain(positions.value)) return Object.freeze([])
    const entry = readOnce(positions.value, position)
    if (!entry.ok || !plain(entry.value)) return Object.freeze([])
    return Object.freeze(Object.keys(entry.value).filter(nonEmptyString))
}

export function handLabel(rowIndex, colIndex) {
    const high = RANKS[Math.min(rowIndex, colIndex)]
    const low = RANKS[Math.max(rowIndex, colIndex)]
    if (rowIndex === colIndex) return `${high}${low}`
    return rowIndex < colIndex ? `${high}${low}s` : `${high}${low}o`
}

function dominantAction(mix) {
    let best = null
    let bestFrequency = 0
    for (const action of ACTION_ORDER) {
        const raw = readOnce(mix, action)
        if (!raw.ok) return null
        const value = raw.value
        if (value === undefined) continue
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return null
        if (value > bestFrequency) {
            bestFrequency = value
            best = action
        }
    }
    return best === null ? null : { action: best, frequency: bestFrequency }
}

export function buildGrid(chart, position, scenario) {
    try {
        if (!plain(chart)) return frame('error')
        if (!nonEmptyString(position) || !nonEmptyString(scenario)) return frame('empty')

        const positions = readOnce(chart, 'positions')
        if (!positions.ok || !plain(positions.value)) return frame('error')
        const positionEntry = readOnce(positions.value, position)
        if (!positionEntry.ok) return frame('error')
        if (!plain(positionEntry.value)) return frame('empty')
        const scenarioEntry = readOnce(positionEntry.value, scenario)
        if (!scenarioEntry.ok) return frame('error')
        if (!plain(scenarioEntry.value)) return frame('empty')

        const ranges = readOnce(scenarioEntry.value, 'ranges')
        if (!ranges.ok) return frame('error')
        if (!plain(ranges.value)) return frame('empty')

        const size = readOnce(scenarioEntry.value, 'size')
        if (!size.ok) return frame('error')
        const sizeLabel = nonEmptyString(size.value) ? size.value : null

        const cells = []
        for (let row = 0; row < RANKS.length; row += 1) {
            for (let col = 0; col < RANKS.length; col += 1) {
                const label = handLabel(row, col)
                const mixRaw = readOnce(ranges.value, label)
                if (!mixRaw.ok) return frame('error')
                const mix = mixRaw.value
                if (mix === undefined) {
                    cells.push(Object.freeze({ hand: label, row, col, action: null, frequency: 0, inRange: false }))
                    continue
                }
                if (!plain(mix)) return frame('error')
                const dominant = dominantAction(mix)
                if (dominant === null) return frame('error')
                cells.push(Object.freeze({
                    hand: label,
                    row,
                    col,
                    action: dominant.action,
                    frequency: dominant.frequency,
                    inRange: dominant.action !== 'fold' && dominant.frequency > 0,
                }))
            }
        }

        if (!cells.some(cell => cell.inRange)) return frame('empty', { sizeLabel })

        return frame('ready', {
            positions: listPositions(chart),
            scenarios: listScenarios(chart, position),
            cells: Object.freeze(cells),
            sizeLabel,
        })
    } catch {
        return frame('error')
    }
}

export function loadingFrame() {
    return frame('loading')
}
