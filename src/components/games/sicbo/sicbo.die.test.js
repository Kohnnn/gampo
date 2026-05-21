import { describe, it, expect } from 'vitest'

// Sic Bo die pip layout sanity (Phase C). Mirrors PIP_LAYOUT in SicBoDie.jsx.

const PIP_LAYOUT = {
    1: ['mc'],
    2: ['tl', 'br'],
    3: ['tl', 'mc', 'br'],
    4: ['tl', 'tr', 'bl', 'br'],
    5: ['tl', 'tr', 'mc', 'bl', 'br'],
    6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'],
}

describe('SicBoDie pip layout', () => {
    it('value 1 has a single centre pip', () => {
        expect(PIP_LAYOUT[1]).toEqual(['mc'])
    })

    it('every face has the right pip count', () => {
        for (let n = 1; n <= 6; n++) {
            expect(PIP_LAYOUT[n].length).toBe(n)
        }
    })

    it('faces 2-6 always include both diagonal corners', () => {
        for (let n = 2; n <= 6; n++) {
            expect(PIP_LAYOUT[n]).toContain('tl')
            expect(PIP_LAYOUT[n]).toContain('br')
        }
    })

    it('only face 6 lights up the middle row pair', () => {
        expect(PIP_LAYOUT[6]).toContain('ml')
        expect(PIP_LAYOUT[6]).toContain('mr')
        for (let n = 2; n <= 5; n++) {
            expect(PIP_LAYOUT[n]).not.toContain('ml')
            expect(PIP_LAYOUT[n]).not.toContain('mr')
        }
    })
})
