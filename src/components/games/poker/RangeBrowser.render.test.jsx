// Render-level truthfulness contract for the Range Browser grid.
//
// RangeBrowser itself takes no props by design (PokerGameCss.test.js pins
// `<RangeBrowser />` and forbids `decision`/`liveState` in its source), and its
// data arrives via useEffect, which does not run under renderToStaticMarkup.
// Adding a prop seam purely for testability would violate that contract.
//
// Instead these tests render the same markup the component renders, driven by the
// real buildGrid output over the real committed chart. That keeps the pure logic,
// the real data, and the rendered result under test without touching the
// component's public shape. The JSX below is kept in lockstep with
// RangeBrowser.jsx by the structural assertions in the final describe block.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildGrid, loadingFrame, RANGE_DISCLOSURE } from '../../../poker/strategy/rangeBrowser.js'

const RANK_LABELS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']
const chart = JSON.parse(readFileSync(new URL('../../../../public/data/poker/preflop.json', import.meta.url), 'utf8'))

// Mirrors RangeBrowser.jsx's render body for a given grid frame.
function GridView({ grid, position = 'BTN', scenario = 'rfi' }) {
    return (
        <div className="pk-range" data-poker-range-status={grid.status} data-testid={grid.testId}>
            <p className="pk-range-disclosure">{grid.disclosure}</p>
            {grid.sizeLabel && <span className="pk-range-size">Open {grid.sizeLabel}</span>}
            {grid.status === 'loading' && <p className="pk-range-empty">Loading chart data.</p>}
            {grid.status === 'error' && <p className="pk-range-empty">Chart data could not be read.</p>}
            {grid.status === 'empty' && <p className="pk-range-empty">No range data ships for this spot.</p>}
            {grid.status === 'ready' && (
                <div className="pk-range-grid" role="grid" aria-label={`${position} ${scenario} starting hands`}>
                    {RANK_LABELS.map((_, row) => (
                        <div className="pk-range-row" role="row" key={row}>
                            {RANK_LABELS.map((__, col) => {
                                const cell = grid.cells[row * 13 + col]
                                return (
                                    <span
                                        role="gridcell"
                                        key={cell.hand}
                                        className={`pk-range-cell ${cell.inRange ? `is-${cell.action}` : 'is-out'}`}
                                        title={`${cell.hand} ${cell.inRange ? `${cell.action} ${Math.round(cell.frequency * 100)}%` : 'not in range'}`}
                                    >
                                        {cell.hand}
                                    </span>
                                )
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const render = (grid, rest = {}) => renderToStaticMarkup(<GridView grid={grid} {...rest} />)

describe('range browser render — provenance honesty', () => {
    it('always shows the unreviewed disclosure in every state', () => {
        const frames = [
            buildGrid(chart, 'BTN', 'rfi'),
            buildGrid(chart, 'BB', 'rfi'),
            buildGrid(null, 'BTN', 'rfi'),
            buildGrid(chart, '', ''),
            loadingFrame(),
        ]
        for (const grid of frames) {
            const html = render(grid)
            expect(html, grid.status).toContain(RANGE_DISCLOSURE)
            expect(html, grid.status).toContain('Unreviewed reference data')
            expect(html, grid.status).toContain('Not advice')
        }
    })

    it('never claims the data is reviewed or prescriptive', () => {
        const html = render(buildGrid(chart, 'BTN', 'rfi'))
        expect(html).not.toMatch(/(?<!un)reviewed/i)
        expect(html).not.toMatch(/you should|recommend|best play|optimal/i)
        expect(html).not.toMatch(/\bGTO\b|\bsolver\b/i)
    })

    it('keeps every frame non-prescriptive and unreviewed at the data layer', () => {
        for (const grid of [buildGrid(chart, 'BTN', 'rfi'), buildGrid(null, 'x', 'y'), loadingFrame()]) {
            expect(grid.reviewed).toBe(false)
            expect(grid.prescriptive).toBe(false)
            expect(grid.provenanceKind).toBe('legacy-local')
        }
    })
})

describe('range browser render — grid output over real committed data', () => {
    it('renders a full 169-cell grid for a populated spot', () => {
        const grid = buildGrid(chart, 'BTN', 'rfi')
        expect(grid.status).toBe('ready')
        const html = render(grid)
        expect((html.match(/role="gridcell"/g) || []).length).toBe(169)
        expect((html.match(/role="row"/g) || []).length).toBe(13)
        expect(html).toContain('aria-label="BTN rfi starting hands"')
    })

    it('marks in-range and out-of-range hands distinguishably', () => {
        const grid = buildGrid(chart, 'BTN', 'rfi')
        const html = render(grid)
        expect(html).toContain('pk-range-cell is-raise')
        expect(html).toContain('pk-range-cell is-out')
        expect(html).toContain('title="AA raise')
        expect(html).toMatch(/title="32o not in range"/)
    })

    it('never paints a folded or zero-frequency hand as in range', () => {
        // Guards against a blanket inRange:true, which would render the whole
        // 169-hand grid as playable and silently overstate the chart.
        const grid = buildGrid(chart, 'BTN', 'rfi')
        const outs = grid.cells.filter(cell => !cell.inRange)
        expect(outs.length).toBeGreaterThan(0)
        for (const cell of grid.cells) {
            if (cell.inRange) {
                expect(cell.action, cell.hand).not.toBe('fold')
                expect(cell.frequency, cell.hand).toBeGreaterThan(0)
            }
        }
        const html = render(grid)
        const outCells = (html.match(/pk-range-cell is-out/g) || []).length
        expect(outCells).toBe(outs.length)
        expect(html).not.toContain('pk-range-cell is-fold')
    })

    it('renders the documented BB/rfi gap as empty rather than inventing a range', () => {
        // F-03-01: BB has no rfi range by design. It must read as empty, not fabricated.
        const grid = buildGrid(chart, 'BB', 'rfi')
        expect(grid.status).toBe('empty')
        expect(grid.cells).toEqual([])
        const html = render(grid, { position: 'BB' })
        expect(html).toContain('No range data ships for this spot.')
        expect(html).not.toContain('role="gridcell"')
        expect(html).not.toContain('pk-range-grid')
    })

    it('reports empty when a spot ships a range table with nothing actually in it', () => {
        // Distinct from a missing scenario: here the ranges object exists and is
        // well formed, but every listed hand folds. A grid of 169 dead cells must
        // not read as "ready".
        const allFold = {
            positions: {
                BTN: { rfi: { size: '2.5bb', ranges: { AA: { fold: 1 }, KK: { fold: 0.75 }, QQ: { fold: 1 } } } },
            },
        }
        const grid = buildGrid(allFold, 'BTN', 'rfi')
        expect(grid.status).toBe('empty')
        expect(grid.cells).toEqual([])
        const html = render(grid)
        expect(html).toContain('No range data ships for this spot.')
        expect(html).not.toContain('role="gridcell"')
        expect(html).not.toContain('pk-range-grid')
    })

    it('treats an all-zero frequency mix as unreadable rather than as a fold range', () => {
        // A mix that sums to zero carries no information. buildGrid reports error
        // so the view says the data could not be read instead of guessing.
        const zeroMix = {
            positions: { BTN: { rfi: { size: '2.5bb', ranges: { AA: { raise: 0 } } } } },
        }
        const grid = buildGrid(zeroMix, 'BTN', 'rfi')
        expect(grid.status).toBe('error')
        const html = render(grid)
        expect(html).toContain('Chart data could not be read.')
        expect(html).not.toContain('role="gridcell"')
    })

    it('renders error and loading states without any grid', () => {
        for (const [grid, text] of [[buildGrid(null, 'BTN', 'rfi'), 'Chart data could not be read.'], [loadingFrame(), 'Loading chart data.']]) {
            const html = render(grid)
            expect(html).toContain(text)
            expect(html).not.toContain('role="gridcell"')
            expect(html).not.toMatch(/\d+%/)
        }
    })

    it('surfaces the open size only when the chart supplies one', () => {
        const grid = buildGrid(chart, 'BTN', 'rfi')
        const html = render(grid)
        if (grid.sizeLabel) expect(html).toContain('Open ' + grid.sizeLabel)
        else expect(html).not.toContain('pk-range-size')
        expect(render(loadingFrame())).not.toContain('pk-range-size')
    })
})

describe('range browser render — mirror stays in lockstep with the component', () => {
    // If RangeBrowser.jsx's markup changes, these force this file to be updated too,
    // so the render tests cannot silently drift from the shipped component.
    const source = readFileSync(new URL('./RangeBrowser.jsx', import.meta.url), 'utf8')

    it('shares the structural contract asserted above', () => {
        for (const token of [
            'data-poker-range-status={grid.status}',
            'className="pk-range-disclosure"',
            'role="gridcell"',
            'role="grid"',
            'pk-range-cell ${cell.inRange',
            'grid.cells[row * 13 + col]',
            'No range data ships for this spot.',
            'Chart data could not be read.',
            'Loading chart data.',
        ]) {
            expect(source, token).toContain(token)
        }
    })

    it('still takes no props and stays independent of the live hand', () => {
        expect(source).toContain('export default function RangeBrowser()')
        expect(source).not.toContain('decision')
        expect(source).not.toContain('liveState')
    })
})
