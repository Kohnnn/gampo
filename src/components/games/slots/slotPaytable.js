// slotPaytable — derive a real, per-count pay ladder for any slot template,
// mirroring the engine's evaluation math in slotFactory.js. Pure + testable.
//
// Engine pay formulas (see evaluateLines/Ways/Megaways/Cluster/PayAnywhere):
//   lines:       payout * {3:0.5, 4:1.4, 5:3.2}[count]
//   ways:        payout * columns * 0.42         (columns 3..cols)
//   megaways:    payout * waysProduct * 0.18      (shown as a representative)
//   cluster:     payout * (clusterSize / clusterMin)
//   pay-anywhere:payout * (count / payAnywhereMin)
//
// We surface a compact ladder per pay symbol plus wild/scatter rows, and a
// max-win figure taken from the engine cap when present.

import { round2 } from '../../../utils/simulationMath'

const LINE_LADDER = { 3: 0.5, 4: 1.4, 5: 3.2 }

function isPay(item) {
    return item && item.type !== 'scatter' && item.type !== 'coin' && item.type !== 'money' && item.type !== 'mystery' && item.type !== 'wild'
}

/**
 * @typedef {object} SlotSymbol
 * @property {string} [id]
 * @property {string} [label]
 * @property {string} [type] 'scatter' | 'wild' | 'coin' | 'money' | 'mystery' | pay symbol
 * @property {number} [payout] base pay multiplier before the per-mode ladder
 * @property {string} [asset]
 *
 * @typedef {object} SlotScatterFeature
 * @property {number} [trigger]
 * @property {number} [triggerCount] older templates spell it this way
 * @property {number} [awardFreeSpins]
 * @property {number} [pay]
 *
 * @typedef {object} SlotTemplateConfig
 * @property {Array<SlotSymbol>} [symbols] pay/wild/scatter symbol definitions
 * @property {{ evaluation?: string, cols?: number }} [layout] real templates carry the mode here
 * @property {string} [evaluation] synthetic test configs sometimes set the mode directly
 * @property {{ clusterMin?: number, payAnywhereMin?: number, maxWinMultiplier?: number, scatter?: SlotScatterFeature }} [features]
 * @property {number} [maxWinMultiplier] top-level fallback used by synthetic configs only
 *
 * @param {SlotTemplateConfig} config a slot template (from getSlotTemplate)
 * @returns {{ mode, columns, rungs:number[], rows:Array, wild, scatter, maxWin }}
 */
export function buildPaytable(config = {}) {
    const symbols = Array.isArray(config.symbols) ? config.symbols : []
    // Real templates store the evaluation mode at config.layout.evaluation;
    // synthetic test configs sometimes set config.evaluation directly.
    const mode = config.layout?.evaluation || config.evaluation || 'lines'
    const cols = config.layout?.cols || 5
    const paySymbols = symbols.filter(isPay)

    // Determine the "counts" each ladder column represents.
    let rungs
    if (mode === 'lines') rungs = [3, 4, 5]
    else if (mode === 'ways' || mode === 'megaways') rungs = [3, 4, 5].filter(n => n <= cols)
    else if (mode === 'cluster') {
        const min = config.features?.clusterMin || 5
        rungs = [min, min + 3, min + 6]
    } else {
        const min = config.features?.payAnywhereMin || 8
        rungs = [min, min + 4, min + 8]
    }

    const payFor = (payout, count) => {
        switch (mode) {
            case 'lines':
                return round2(payout * (LINE_LADDER[count] || 1))
            case 'ways':
                return round2(payout * count * 0.42)
            case 'megaways':
                // Representative: count columns each contributing 2 ways.
                return round2(payout * Math.pow(2, count) * 0.18)
            case 'cluster': {
                const min = config.features?.clusterMin || 5
                return round2(payout * (count / min))
            }
            default: {
                const min = config.features?.payAnywhereMin || 8
                return round2(payout * (count / min))
            }
        }
    }

    const rows = paySymbols
        .slice()
        .sort((a, b) => (b.payout || 0) - (a.payout || 0))
        .map(sym => ({
            id: sym.id,
            label: sym.label,
            asset: sym.asset,
            pays: rungs.map(count => ({ count, multiplier: payFor(sym.payout || 0, count) })),
        }))

    const wild = symbols.find(s => s.type === 'wild') || null
    const scatter = symbols.find(s => s.type === 'scatter') || config.features?.scatter
        ? {
            label: (symbols.find(s => s.type === 'scatter')?.label) || 'Scatter',
            trigger: config.features?.scatter?.trigger || config.features?.scatter?.triggerCount || 3,
            awardFreeSpins: config.features?.scatter?.awardFreeSpins || 0,
            pay: config.features?.scatter?.pay || 0,
        }
        : null

    // Engine reads the cap from config.features.maxWinMultiplier (slotFactory.js
    // resolveSlotSpin). Fall back to a top-level field for synthetic configs.
    const maxWinRaw = config.features?.maxWinMultiplier ?? config.maxWinMultiplier
    const maxWin = Number.isFinite(maxWinRaw) ? maxWinRaw : null

    return {
        mode,
        columns: cols,
        rungs,
        rows,
        wild: wild ? { label: wild.label } : null,
        scatter,
        maxWin,
    }
}

export const PAYTABLE_MODE_LABELS = {
    lines: 'Line pays (left to right)',
    ways: 'Ways pays',
    megaways: 'Megaways',
    cluster: 'Cluster pays',
    'pay-anywhere': 'Pay anywhere',
    payAnywhere: 'Pay anywhere',
}
