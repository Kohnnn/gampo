import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { BROWSER_STATUSES, RANGE_DISCLOSURE, buildGrid, handLabel, listPositions, listScenarios, loadingFrame } from './rangeBrowser.js'

const chart = JSON.parse(readFileSync(new URL('../../../public/data/poker/preflop.json', import.meta.url), 'utf8'))

describe('rangeBrowser grid construction', () => {
    it('labels the 13x13 grid with standard suited/offsuit notation', () => {
        expect(handLabel(0, 0)).toBe('AA')
        expect(handLabel(12, 12)).toBe('22')
        expect(handLabel(0, 1)).toBe('AKs')
        expect(handLabel(1, 0)).toBe('AKo')
        expect(handLabel(0, 12)).toBe('A2s')
        expect(handLabel(12, 0)).toBe('A2o')
    })

    it('builds a full 169-cell grid from the committed chart', () => {
        const grid = buildGrid(chart, 'UTG', 'rfi')
        expect(grid.status).toBe('ready')
        expect(grid.cells).toHaveLength(169)
        expect(new Set(grid.cells.map(c => c.hand)).size).toBe(169)
        expect(grid.cells.some(c => c.inRange)).toBe(true)
    })

    it('marks premium hands in range and trash hands out of range', () => {
        const grid = buildGrid(chart, 'UTG', 'rfi')
        const byHand = new Map(grid.cells.map(c => [c.hand, c]))
        expect(byHand.get('AKs').inRange).toBe(true)
        expect(byHand.get('AKs').action).toBe('raise')
        expect(byHand.get('32o').inRange).toBe(false)
    })

    it('reports the raise size label when present', () => {
        expect(buildGrid(chart, 'UTG', 'rfi').sizeLabel).toBe('2.5bb')
    })

    it('enumerates real positions and scenarios from the chart', () => {
        expect(listPositions(chart)).toEqual(['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'])
        expect(listScenarios(chart, 'BB')).toContain('vs-btn-open')
        expect(listScenarios(chart, 'UTG')).toEqual(['rfi'])
    })

    it('builds every position/scenario pair in the shipped chart without error', () => {
        for (const position of listPositions(chart)) {
            for (const scenario of listScenarios(chart, position)) {
                const grid = buildGrid(chart, position, scenario)
                expect(BROWSER_STATUSES).toContain(grid.status)
                expect(grid.status).not.toBe('error')
                if (grid.status === 'ready') expect(grid.cells).toHaveLength(169)
            }
        }
    })

    it('treats BB rfi as empty because the chart ships no ranges for it', () => {
        expect(chart.positions.BB.rfi.ranges).toBeUndefined()
        expect(buildGrid(chart, 'BB', 'rfi').status).toBe('empty')
    })

    it('builds a ready grid for every pair that ships ranges', () => {
        const ready = []
        for (const position of listPositions(chart)) {
            for (const scenario of listScenarios(chart, position)) {
                if (chart.positions[position][scenario].ranges === undefined) continue
                const grid = buildGrid(chart, position, scenario)
                expect(grid.status).toBe('ready')
                expect(grid.cells).toHaveLength(169)
                ready.push(`${position}/${scenario}`)
            }
        }
        expect(ready).toHaveLength(10)
    })
})

describe('rangeBrowser truthfulness', () => {
    it('always declares itself unreviewed, non-prescriptive legacy data', () => {
        const frames = [
            buildGrid(chart, 'UTG', 'rfi'),
            buildGrid(chart, '', ''),
            buildGrid(null, 'UTG', 'rfi'),
            loadingFrame(),
        ]
        for (const frame of frames) {
            expect(frame.prescriptive).toBe(false)
            expect(frame.reviewed).toBe(false)
            expect(frame.provenanceKind).toBe('legacy-local')
            expect(frame.disclosure).toBe(RANGE_DISCLOSURE)
        }
    })

    it('never claims to be reviewed strategy in its disclosure copy', () => {
        expect(RANGE_DISCLOSURE).toContain('Unreviewed')
        expect(RANGE_DISCLOSURE).toContain('Not advice')
    })

    it('gives each status a distinct test id', () => {
        const ids = [
            buildGrid(chart, 'UTG', 'rfi').testId,
            buildGrid(chart, '', '').testId,
            loadingFrame().testId,
            buildGrid(null, 'UTG', 'rfi').testId,
        ]
        expect(new Set(ids).size).toBe(4)
        expect(ids).toEqual(['range-browser-ready', 'range-browser-empty', 'range-browser-loading', 'range-browser-error'])
    })
})

describe('rangeBrowser fails closed', () => {
    it('returns empty for unknown positions and scenarios', () => {
        expect(buildGrid(chart, 'NOPE', 'rfi').status).toBe('empty')
        expect(buildGrid(chart, 'UTG', 'nope').status).toBe('empty')
        expect(buildGrid(chart, '', '').status).toBe('empty')
    })

    it('returns error for non-plain charts', () => {
        for (const bad of [null, undefined, 0, 'chart', [], () => {}, new Date()]) {
            expect(buildGrid(bad, 'UTG', 'rfi').status).toBe('error')
        }
    })

    it('returns error for malformed frequency payloads', () => {
        const cases = [
            { raise: 1.7 },
            { raise: -1 },
            { raise: Number.NaN },
            { raise: 'lots' },
            { raise: null },
        ]
        for (const mix of cases) {
            const hostile = { positions: { UTG: { rfi: { size: '2.5bb', ranges: { AA: mix } } } } }
            expect(buildGrid(hostile, 'UTG', 'rfi').status).toBe('error')
        }
    })

    it('survives throwing accessors anywhere in the traversal', () => {
        const throwing = () => { throw new Error('hostile') }

        const badPositions = {}
        Object.defineProperty(badPositions, 'positions', { get: throwing, configurable: true })
        expect(buildGrid(badPositions, 'UTG', 'rfi').status).toBe('error')

        const badEntry = { positions: {} }
        Object.defineProperty(badEntry.positions, 'UTG', { get: throwing, configurable: true })
        expect(buildGrid(badEntry, 'UTG', 'rfi').status).toBe('error')

        const badRanges = { positions: { UTG: { rfi: {} } } }
        Object.defineProperty(badRanges.positions.UTG.rfi, 'ranges', { get: throwing, configurable: true })
        expect(buildGrid(badRanges, 'UTG', 'rfi').status).toBe('error')
    })

    it('treats a chart with no in-range hands as empty rather than ready', () => {
        const allFold = { positions: { UTG: { rfi: { size: '2.5bb', ranges: { AA: { fold: 1 } } } } } }
        expect(buildGrid(allFold, 'UTG', 'rfi').status).toBe('empty')
    })

    it('returns frozen frames that callers cannot mutate', () => {
        const grid = buildGrid(chart, 'UTG', 'rfi')
        expect(Object.isFrozen(grid)).toBe(true)
        expect(Object.isFrozen(grid.cells)).toBe(true)
        expect(Object.isFrozen(grid.cells[0])).toBe(true)
        expect(() => { 'use strict'; grid.prescriptive = true }).toThrow()
    })

    it('does not mutate the source chart', () => {
        const snapshot = JSON.stringify(chart)
        buildGrid(chart, 'BTN', 'rfi')
        expect(JSON.stringify(chart)).toBe(snapshot)
    })
})
