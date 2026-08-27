// slotPaylines — describe a template's pay structure for the "How it pays"
// visualizer. Pure + testable. Returns rows of cell-index groups to highlight
// plus a short human explanation, derived from the same evaluation modes the
// engine uses (see slotFactory evaluate*).

export function describePaylines(config = {}) {
    const mode = config.evaluation || config.layout?.evaluation || 'lines'
    const cols = config.layout?.cols || 5
    const rows = config.layout?.rows || 4

    if (mode === 'lines') {
        // Engine pays each row left-to-right from column 0. Highlight each row.
        const groups = []
        for (let r = 0; r < rows; r += 1) {
            const idx = []
            for (let c = 0; c < cols; c += 1) idx.push(r * cols + c)
            groups.push(idx)
        }
        return {
            mode,
            groups,
            explain: `${rows} pay lines, each a full row. Matches pay from the leftmost reel on adjacent reels (3+ in a row).`,
        }
    }

    if (mode === 'ways') {
        return {
            mode,
            groups: [],
            explain: `Ways pays: any matching symbol on adjacent reels from the left pays, in any row position. Up to ${Math.pow(rows, cols).toLocaleString()} ways.`,
        }
    }

    if (mode === 'megaways') {
        const columnRows = config.layout?.columnRows
        const ways = Array.isArray(columnRows) && columnRows.length
            ? columnRows.reduce((m, v) => m * v, 1)
            : 0
        return {
            mode,
            groups: [],
            explain: ways
                ? `Megaways: reels show different symbol counts (${columnRows.join('-')}), giving a fixed ${ways.toLocaleString()} ways to win. Adjacent matches from the left pay.`
                : 'Megaways: each reel shows a different number of symbols, so matches pay across far more ways than fixed lines. Adjacent matches from the left pay.',
        }
    }

    if (mode === 'cluster') {
        const min = config.features?.clusterMin || 5
        return {
            mode,
            groups: [],
            explain: `Cluster pays: ${min}+ matching symbols touching anywhere on the grid pay together — position-independent.`,
        }
    }

    const min = config.features?.payAnywhereMin || 8
    return {
        mode,
        groups: [],
        explain: `Pay anywhere: ${min}+ matching symbols anywhere on the grid pay, regardless of position.`,
    }
}
