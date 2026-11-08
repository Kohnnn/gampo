import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { molesAdmission } from './MolesGame'

const source = readFileSync(new URL('./MolesGame.jsx', import.meta.url), 'utf8')

// QA: Moles could settle two charged rounds as one. `running` is React state and
// only becomes true after a flush, so two performPlay calls in the same tick both
// passed the guard: the second charged the wallet, then its scheduled callback
// cancelled the first round's settlement before addWinnings ran.
describe('Moles play admission', () => {
    it('admits a play only when nothing is in flight and no round is running', () => {
        expect(molesAdmission({ inFlight: false, running: false })).toBe('admitted')
    })

    it('refuses a second call in the same tick, before `running` has flushed', () => {
        // The exact hazard: the caller already charged and set inFlight, while the
        // render-passed `running` is still false.
        expect(molesAdmission({ inFlight: true, running: false })).toBe('in-flight')
    })

    it('refuses while a revealed round is on screen', () => {
        expect(molesAdmission({ inFlight: false, running: true })).toBe('running')
    })

    it('wires the ref clear only from the settlement callback', () => {
        const settle = source.slice(source.indexOf('schedule(() => {\n            setMoles(placed)'))
        expect(settle).toContain('inFlightRef.current = false')
        // Cleared after the payout path, not before, so an early error cannot
        // re-open admission while credits are still owed.
        expect(settle.indexOf('addWinnings')).toBeLessThan(settle.indexOf('inFlightRef.current = false'))
    })

    it('never clears the guard from a cancel path that could strand a paid round', () => {
        expect(source).not.toMatch(/cancelAll\(\)[\s\S]{0,80}inFlightRef\.current = false/)
    })
})
