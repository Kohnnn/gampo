import { describe, it, expect } from 'vitest'
import { REASONS } from './decisionContract.js'
import {
    coverGap,
    classifyReason,
    potOddsBreakEven,
    stackToPotRatio,
    COVERAGE_CEILING,
    COVERAGE_CONFIDENCE,
    COVERAGE_STATUSES,
} from './heuristicCoverage.js'

const table = (over = {}) => ({ pot: 100, toCall: 50, effectiveStack: 1000, bb: 20, legalActions: ['call', 'fold', 'raise'], ...over })
const gap = (over = {}) => ({
    decision: { state: 'unavailable', reason: 'MISSING_LOOKUP_POSITION' },
    table: table(),
    sourceConfigured: false,
    ...over,
})

const ALL_REASONS = Object.values(REASONS)

describe('reason classification', () => {
    it('classifies every contract reason without throwing', () => {
        expect(ALL_REASONS).toHaveLength(23)
        for (const reason of ALL_REASONS) {
            const kind = classifyReason(reason, false)
            expect(['absence', 'corruption', 'not-applicable']).toContain(kind)
        }
    })

    it('treats corruption reasons as corruption, never absence', () => {
        for (const reason of ['INVALID_SEATING', 'INVALID_BLINDS', 'SOURCE_RESULT_INVALID', 'STALE_COMPLETION', 'INVALID_HISTORY']) {
            expect(classifyReason(reason, true)).toBe('corruption')
        }
    })

    it('treats an unknown reason as corruption (fails closed)', () => {
        expect(classifyReason('SOMETHING_NEW', false)).toBe('corruption')
        expect(classifyReason('', false)).toBe('corruption')
        expect(classifyReason(null, false)).toBe('corruption')
        expect(classifyReason(123, false)).toBe('corruption')
    })

    it('splits INVALID_SOURCE by whether a source was configured', () => {
        expect(classifyReason('INVALID_SOURCE', false)).toBe('absence')
        expect(classifyReason('INVALID_SOURCE', true)).toBe('corruption')
    })
})

describe('arithmetic', () => {
    it('computes break-even from pot and price', () => {
        expect(potOddsBreakEven(100, 50)).toBeCloseTo(1 / 3, 10)
        expect(potOddsBreakEven(150, 50)).toBeCloseTo(0.25, 10)
    })

    it('returns null rather than a wrong number on bad input', () => {
        expect(potOddsBreakEven(100, 0)).toBeNull()
        expect(potOddsBreakEven(-1, 50)).toBeNull()
        expect(potOddsBreakEven(100, -5)).toBeNull()
        expect(potOddsBreakEven(NaN, 50)).toBeNull()
        expect(potOddsBreakEven(Infinity, 50)).toBeNull()
        expect(potOddsBreakEven('100', 50)).toBeNull()
    })

    it('computes and guards stack-to-pot ratio', () => {
        expect(stackToPotRatio(1000, 100)).toBe(10)
        expect(stackToPotRatio(1000, 0)).toBeNull()
        expect(stackToPotRatio(-1, 100)).toBeNull()
        expect(stackToPotRatio(1000, NaN)).toBeNull()
    })
})

describe('exact-first precedence', () => {
    it('yields to a supported result', () => {
        const out = coverGap(gap({ decision: { state: 'supported', reason: null } }))
        expect(out.status).toBe('exact-wins')
        expect(out.notes).toHaveLength(0)
    })

    it('yields to an approximate result', () => {
        expect(coverGap(gap({ decision: { state: 'approximate', reason: null } })).status).toBe('exact-wins')
    })

    it('shows nothing while loading', () => {
        expect(coverGap(gap({ decision: { state: 'loading', reason: null } })).status).toBe('none')
    })
})

describe('corrupt state never falls through to arithmetic', () => {
    for (const reason of ['INVALID_SEATING', 'INVALID_BLINDS', 'INVALID_STACK_MODEL', 'INVALID_HISTORY', 'SOURCE_RESULT_INVALID', 'INVALID_CANONICAL_VALUE', 'STALE_COMPLETION']) {
        it(`blocks on ${reason} even though the table numbers look fine`, () => {
            const out = coverGap(gap({ decision: { state: 'error', reason }, sourceConfigured: true }))
            expect(out.status).toBe('blocked')
            expect(out.notes).toHaveLength(0)
        })
    }

    it('blocks a configured source that returned garbage', () => {
        expect(coverGap(gap({ decision: { state: 'error', reason: 'INVALID_SOURCE' }, sourceConfigured: true })).status).toBe('blocked')
    })
})

describe('bounded coverage on genuine absence', () => {
    it('covers a missing lookup position with arithmetic facts', () => {
        const out = coverGap(gap())
        expect(out.status).toBe('covered')
        expect(out.notes.length).toBeGreaterThan(0)
        const potOdds = out.notes.find(n => n.id === 'pot-odds')
        expect(potOdds.value).toBe('33%')
    })

    it('is deterministic across repeated calls', () => {
        const a = coverGap(gap())
        const b = coverGap(gap())
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    })

    it('flags folding as dominated only when checking is free', () => {
        const free = coverGap(gap({ table: table({ toCall: 0, legalActions: ['check', 'fold'] }) }))
        expect(free.notes.some(n => n.id === 'dominated-fold')).toBe(true)

        const priced = coverGap(gap())
        expect(priced.notes.some(n => n.id === 'dominated-fold')).toBe(false)
    })

    it('omits pot odds when there is no price to pay', () => {
        const out = coverGap(gap({ table: table({ toCall: 0, legalActions: ['check'] }) }))
        expect(out.notes.some(n => n.id === 'pot-odds')).toBe(false)
    })

    it('reports not-applicable when it is not hero turn', () => {
        expect(coverGap(gap({ decision: { state: 'unavailable', reason: 'MISSING_HERO_TURN' } })).status).toBe('not-applicable')
    })
})

describe('honesty invariants', () => {
    const states = [
        gap(),
        gap({ table: table({ toCall: 0, legalActions: ['check', 'fold'] }) }),
        gap({ decision: { state: 'error', reason: 'INVALID_SEATING' } }),
        gap({ decision: { state: 'supported', reason: null } }),
        gap({ decision: { state: 'loading', reason: null } }),
    ]

    it('is never prescriptive and never claims high confidence', () => {
        for (const input of states) {
            const out = coverGap(input)
            expect(out.prescriptive).toBe(false)
            expect(out.confidence).toBe(COVERAGE_CONFIDENCE)
            expect(['low', 'moderate']).toContain(out.confidence)
            expect(out.ceiling).toBe(COVERAGE_CEILING)
        }
    })

    it('never recommends an action anywhere in its output', () => {
        const banned = /\b(you should|we recommend|best play|correct play|optimal|must fold|must call|must raise|shove|jam)\b/i
        for (const input of states) {
            const text = JSON.stringify(coverGap(input))
            expect(text).not.toMatch(banned)
        }
    })

    it('never emits EV, equity, solver or frequency claims', () => {
        const banned = /\b(gto|solver|equity|expected value|\bev\b|frequency|exploit)\b/i
        for (const input of states) {
            expect(JSON.stringify(coverGap(input))).not.toMatch(banned)
        }
    })

    it('emits no action-shaped fields', () => {
        for (const input of states) {
            const out = coverGap(input)
            for (const key of ['action', 'recommendation', 'bestAction', 'sizing', 'raiseTo', 'ev', 'equity']) {
                expect(out).not.toHaveProperty(key)
            }
        }
    })

    it('only ever returns a known status', () => {
        for (const input of states) expect(COVERAGE_STATUSES).toContain(coverGap(input).status)
    })

    it('freezes output so a consumer cannot mutate it', () => {
        const out = coverGap(gap())
        expect(Object.isFrozen(out)).toBe(true)
        expect(Object.isFrozen(out.notes)).toBe(true)
    })
})

describe('hostile input fails closed', () => {
    it('blocks on non-objects', () => {
        for (const bad of [null, undefined, 42, 'x', [], true]) {
            expect(coverGap(bad).status).toBe('blocked')
        }
    })

    it('blocks when the decision is a class instance rather than plain data', () => {
        class Forged { constructor() { this.state = 'unavailable'; this.reason = 'MISSING_LOOKUP_POSITION' } }
        expect(coverGap(gap({ decision: new Forged() })).status).toBe('blocked')
    })

    it('blocks when an accessor throws', () => {
        const hostile = gap()
        Object.defineProperty(hostile.table, 'pot', { get() { throw new Error('boom') } })
        expect(coverGap(hostile).status).toBe('blocked')
    })

    it('blocks when the table hides values behind a proxy', () => {
        const proxied = new Proxy({}, { get() { throw new Error('nope') } })
        expect(coverGap(gap({ table: proxied })).status).toBe('blocked')
    })

    it('blocks unreadable numbers instead of printing NaN', () => {
        const out = coverGap(gap({ table: table({ pot: NaN }) }))
        expect(out.status).toBe('blocked')
        expect(JSON.stringify(out)).not.toMatch(/NaN|Infinity|undefined/)
    })

    it('blocks when legalActions is not an array', () => {
        expect(coverGap(gap({ table: table({ legalActions: 'call' }) })).status).toBe('blocked')
    })
})

describe('no bot reuse', () => {
    it('imports nothing from the bot layer', async () => {
        const { readFileSync } = await import('node:fs')
        const src = readFileSync(new URL('./heuristicCoverage.js', import.meta.url), 'utf8')
        expect(src).not.toMatch(/from\s+['"].*bots?\//i)
        expect(src).not.toMatch(/HeuristicBot|postflopEquity|createSeededPokerRng|Math\.random/)
    })
})
