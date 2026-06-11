import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CASE_PRIZE_INDEX } from './casesAnimation'
import { CaseMultiOpenGrid } from './CasesGame.jsx'

function makeOutcome(index, overrides = {}) {
    return {
        id: `item-${index}`,
        skinId: `skin-${index}`,
        variantKey: `skin-${index}:MW:0.${index}42${overrides.statTrak ? ':ST' : ''}`,
        name: `Weapon ${index}`,
        image: `/weapon-${index}.png`,
        rarity: index % 3 === 0 ? 'Classified' : 'Mil-Spec Grade',
        color: index % 3 === 0 ? '#d32ce6' : '#4b69ff',
        valueGc: 1.25 + index,
        profitGc: index - 4,
        wear: 'Minimal Wear',
        wearShort: 'MW',
        float: 0.142 + (index / 1000),
        statTrak: Boolean(overrides.statTrak),
        souvenir: Boolean(overrides.souvenir),
        ...overrides,
    }
}

function makeTrack(outcome) {
    return Array.from({ length: CASE_PRIZE_INDEX + 4 }, (_, tileIndex) => (
        tileIndex === CASE_PRIZE_INDEX
            ? outcome
            : makeOutcome(`filler-${tileIndex}`, { valueGc: 0.5, profitGc: -0.5 })
    ))
}

describe('CaseMultiOpenGrid', () => {
    it('renders ten compact slots with target tiles matching settled results', () => {
        const results = Array.from({ length: 10 }, (_, index) => makeOutcome(index, {
            statTrak: index === 2,
            souvenir: index === 7,
        }))
        const tracks = results.map(makeTrack)
        const html = renderToStaticMarkup(
            <CaseMultiOpenGrid
                activeCase={{ name: 'CS2 Test Case' }}
                casePhase="settled"
                results={results}
                trackOffsets={tracks.map(() => -100)}
                tracks={tracks}
            />,
        )

        expect(html).toContain('data-case-layout="multi-grid"')
        expect(html.match(/data-case-row-index="/g)).toHaveLength(10)
        expect(html.match(/data-case-target="true"/g)).toHaveLength(10)

        for (const result of results) {
            expect(html).toContain(`data-case-outcome-id="${result.skinId}"`)
            expect(html).toContain(`data-case-outcome-variant="${result.variantKey}"`)
            expect(html).toContain(result.name)
            expect(html).toContain(result.wearShort)
            expect(html).toContain(result.float.toFixed(3))
        }

        expect(html).toContain('ST™')
        expect(html).toContain('SV')
    })

    it('marks the finale row and staggered settled rows (C5)', () => {
        const results = Array.from({ length: 10 }, (_, index) => makeOutcome(index))
        const tracks = results.map(makeTrack)
        const html = renderToStaticMarkup(
            <CaseMultiOpenGrid
                activeCase={{ name: 'CS2 Test Case' }}
                casePhase="settled"
                results={results}
                trackOffsets={tracks.map(() => -100)}
                tracks={tracks}
                settledRows={[0, 1, 2]}
                finaleRow={4}
            />,
        )
        // Exactly one finale row, and the "Top drop" label appears for it.
        expect(html.match(/is-finale/g)).toHaveLength(1)
        expect(html).toContain('Top drop')
        // Only the three rows we flagged are marked settled in the staggered wave.
        expect(html.match(/is-row-settled/g)).toHaveLength(3)
        // The data-case contracts are still intact under the new props.
        expect(html.match(/data-case-row-index="/g)).toHaveLength(10)
        expect(html.match(/data-case-target="true"/g)).toHaveLength(10)
    })

    it('omits finale/settled markers when not provided (defaults)', () => {
        const results = Array.from({ length: 10 }, (_, index) => makeOutcome(index))
        const tracks = results.map(makeTrack)
        const html = renderToStaticMarkup(
            <CaseMultiOpenGrid
                activeCase={{ name: 'CS2 Test Case' }}
                casePhase="settled"
                results={results}
                trackOffsets={tracks.map(() => -100)}
                tracks={tracks}
            />,
        )
        expect(html).not.toContain('is-finale')
        expect(html).not.toContain('is-row-settled')
        expect(html).not.toContain('Top drop')
    })
})
