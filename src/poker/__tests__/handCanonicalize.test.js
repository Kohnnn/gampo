import { describe, expect, it } from 'vitest'
import { canonical, gridCellFor, codeAt, allHandCodes } from '../util/handCanonicalize'

describe('handCanonicalize', () => {
    it('canonicalizes pairs', () => {
        expect(canonical(['Ks', 'Kh'])).toBe('KK')
        expect(canonical(['2s', '2c'])).toBe('22')
    })
    it('canonicalizes suited and offsuit', () => {
        expect(canonical(['Ks', 'Qs'])).toBe('KQs')
        expect(canonical(['Qs', 'Ks'])).toBe('KQs') // order-independent
        expect(canonical(['Kh', 'Qd'])).toBe('KQo')
    })
    it('grid cells: pairs on diagonal, suited above, offsuit below', () => {
        expect(gridCellFor('AA')).toEqual({ row: 0, col: 0 })
        expect(gridCellFor('22')).toEqual({ row: 12, col: 12 })
        const aks = gridCellFor('AKs')
        expect(aks.row < aks.col).toBe(true)
        const ako = gridCellFor('AKo')
        expect(ako.row > ako.col).toBe(true)
    })
    it('codeAt is inverse of gridCellFor', () => {
        for (const code of allHandCodes()) {
            const cell = gridCellFor(code)
            expect(codeAt(cell.row, cell.col)).toBe(code)
        }
    })
    it('all 169 codes are unique', () => {
        const codes = allHandCodes()
        expect(codes.length).toBe(169)
        expect(new Set(codes).size).toBe(169)
    })
})
