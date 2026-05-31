import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./CasesGame.jsx', import.meta.url), 'utf8')

describe('cases x10 layout contract', () => {
    it('routes ten-row opens to the bulk mini-grid without replacing smaller reel layouts', () => {
        expect(source).toContain('function CaseMultiOpenGrid')
        expect(source).toMatch(/tracks\.length > 0 && rows === 10/)
        expect(source).toMatch(/tracks\.length > 0 && rows !== 10/)
        expect(source).toContain('data-case-layout="multi-grid"')
        expect(source).toContain('data-case-layout="stacked-rows"')
    })

    it('keeps target/result selectors on mini-grid outcome tiles and slots', () => {
        expect(source).toContain('data-case-target={isTarget ?')
        expect(source).toContain('data-case-row-index={rowIndex}')
        expect(source).toContain('data-case-outcome-id={result?.skinId')
        expect(source).toContain('data-case-outcome-variant={result?.variantKey')
    })
})
