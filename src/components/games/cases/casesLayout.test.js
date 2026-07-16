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

    it('moves case commands into one right-panel contract', () => {
        expect(source).toContain('function CaseRightPanel')
        expect(source).toContain('data-case-panel="commands"')
        expect(source).toContain('data-case-action="quick-toggle"')
        expect(source).toContain('data-case-action={autoOpen ?')
        expect(source).toContain('data-case-action="case-switch"')
        expect(source.match(/data-game-action=/g)).toHaveLength(1)
        expect(source).not.toContain('className="cases-command-bar"')
        expect(source).not.toContain('className="cases-result-actions"')
    })

    it('threads the P4 hold-progress state into CaseRightPanel so the right-side Open button does not reference an undefined identifier', () => {
        // Regression for EVL cycle 9: CasesGame previously rendered CaseRightPanel
        // without passing isHolding/handleOpenMouseDown/handleOpenMouseUp. The
        // sub-component destructured them as if they were in-scope hook values,
        // throwing ReferenceError at /cases render time. The owning component
        // must hand these props down explicitly so the JSX evaluator can find them.
        expect(source).toMatch(/isHolding\s*=\s*\{isHolding\}/)
        expect(source).toMatch(/handleOpenMouseDown\s*=\s*\{handleOpenMouseDown\}/)
        expect(source).toMatch(/handleOpenMouseUp\s*=\s*\{handleOpenMouseUp\}/)
        // CaseRightPanel parameter destructure must list all three.
        const destructure = source.match(/function CaseRightPanel\(\{([\s\S]*?)\}\)/)
        expect(destructure, 'CaseRightPanel parameter block must exist').toBeTruthy()
        const params = destructure[1]
        expect(params).toMatch(/\bisHolding\b/)
        expect(params).toMatch(/\bhandleOpenMouseDown\b/)
        expect(params).toMatch(/\bhandleOpenMouseUp\b/)
    })

    it('keeps inventory actions addressable for browser smoke tests', () => {
        expect(source).toContain('data-inventory-action="favorite"')
        expect(source).toContain("data-inventory-action={drop.archived ? 'restore' : 'archive'}")
        expect(source).toContain('data-inventory-action="export"')
        expect(source).toContain('data-inventory-action="import"')
    })
})

describe('cases settlement source contract', () => {
    it('guards finishPendingRound so animation and skip can only settle once', () => {
        expect(source).toContain('if (!claimCaseSettlement(pending)) return')
        expect(source).toContain('pendingRoundRef.current = null')
        expect(source).toContain("setCasePhase('settled')")
        expect(source).toContain('setRunning(false)')
        expect(source).toContain('resolve({ profit })')
    })

    it('routes reduced-motion opens through the same pending settlement path', () => {
        expect(source).toContain('const revealMs = reducedMotion ? 160')
        expect(source).toMatch(/queueRevealTimer\(\(\) => \{\s*finishPendingRound\(\)\s*\}, lidMs \+ revealMs \+ CASE_SETTLE_PAD_MS\)/)
        expect(source).toContain('if (!pendingRoundRef.current || pendingRoundRef.current.settled) return')
    })
})
