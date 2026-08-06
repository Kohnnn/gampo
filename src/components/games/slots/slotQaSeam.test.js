import { describe, expect, it } from 'vitest'
import {
    validateQueuedOutcome,
    validateFreeSpinSession,
    createOutcomeQueue,
} from './slotQaSeam'
import { MAX_FREE_SPINS_PER_SESSION } from './slotConstants'

// A minimal outcome carrying every field finishRound reads without a guard.
// Kept as a factory so no test can leak mutations into another.
function validOutcome(overrides = {}) {
    return {
        cells: [],
        featureEvents: [],
        winningIndexes: [],
        multiplier: 2,
        cascadeSteps: 0,
        coinHits: 0,
        triggeredFreeSpins: 0,
        ...overrides,
    }
}

function validSession(overrides = {}) {
    return { totalAwarded: 8, played: 0, totalWin: 0, baseBet: 1, retriggers: 0, ...overrides }
}

describe('validateQueuedOutcome', () => {
    it('accepts a well-formed outcome', () => {
        const result = validateQueuedOutcome(validOutcome())
        expect(result.ok).toBe(true)
        expect(result.value.multiplier).toBe(2)
    })

    it.each([
        ['null', null],
        ['an array', []],
        ['a string', 'outcome'],
        ['a number', 5],
        ['undefined', undefined],
    ])('rejects %s', (_label, input) => {
        expect(validateQueuedOutcome(input).ok).toBe(false)
    })

    it.each(['cells', 'featureEvents', 'winningIndexes'])('requires %s to be an array', field => {
        expect(validateQueuedOutcome(validOutcome({ [field]: undefined })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ [field]: 'nope' })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ [field]: {} })).ok).toBe(false)
    })

    it.each(['multiplier', 'cascadeSteps', 'coinHits', 'triggeredFreeSpins'])(
        'requires %s to be a finite number',
        field => {
            for (const bad of [undefined, NaN, Infinity, -Infinity, '5', null]) {
                expect(validateQueuedOutcome(validOutcome({ [field]: bad })).ok).toBe(false)
            }
        },
    )

    // multiplier is the payout: finishRound does round2(baseBet * multiplier).
    // These are the cases that would move credits the wrong way in silence.
    it('rejects a negative multiplier', () => {
        const result = validateQueuedOutcome(validOutcome({ multiplier: -3 }))
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/multiplier/)
    })

    it('rejects a NaN multiplier rather than producing NaN credits', () => {
        expect(validateQueuedOutcome(validOutcome({ multiplier: NaN })).ok).toBe(false)
    })

    it('rejects a numeric-string multiplier that would coerce silently', () => {
        expect(validateQueuedOutcome(validOutcome({ multiplier: '10' })).ok).toBe(false)
    })

    it('accepts a zero multiplier (a real losing spin)', () => {
        expect(validateQueuedOutcome(validOutcome({ multiplier: 0 })).ok).toBe(true)
    })

    it('rejects negative cascadeSteps and coinHits', () => {
        expect(validateQueuedOutcome(validOutcome({ cascadeSteps: -1 })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ coinHits: -1 })).ok).toBe(false)
    })

    it('rejects a fractional triggeredFreeSpins', () => {
        expect(validateQueuedOutcome(validOutcome({ triggeredFreeSpins: 2.5 })).ok).toBe(false)
    })

    it('rejects triggeredFreeSpins above the session cap', () => {
        const result = validateQueuedOutcome(
            validOutcome({ triggeredFreeSpins: MAX_FREE_SPINS_PER_SESSION + 1 }),
        )
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/MAX_FREE_SPINS_PER_SESSION/)
    })

    it('accepts triggeredFreeSpins exactly at the cap', () => {
        expect(
            validateQueuedOutcome(validOutcome({ triggeredFreeSpins: MAX_FREE_SPINS_PER_SESSION })).ok,
        ).toBe(true)
    })

    it('rejects malformed featureEvents entries', () => {
        expect(validateQueuedOutcome(validOutcome({ featureEvents: [null] })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ featureEvents: [{}] })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ featureEvents: [{ type: '' }] })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ featureEvents: ['free-spins'] })).ok).toBe(false)
    })

    it('rejects a free-spins event with a non-integer award', () => {
        const result = validateQueuedOutcome(
            validOutcome({ featureEvents: [{ type: 'free-spins', freeSpins: 1.5 }] }),
        )
        expect(result.ok).toBe(false)
    })

    it('accepts a well-formed free-spins event', () => {
        expect(
            validateQueuedOutcome(
                validOutcome({ featureEvents: [{ type: 'free-spins', freeSpins: 8 }] }),
            ).ok,
        ).toBe(true)
    })

    it('rejects non-array cascadeFrames and wildIndexes when present', () => {
        expect(validateQueuedOutcome(validOutcome({ cascadeFrames: 'x' })).ok).toBe(false)
        expect(validateQueuedOutcome(validOutcome({ wildIndexes: 3 })).ok).toBe(false)
        // null/absent are fine — finishRound guards both.
        expect(validateQueuedOutcome(validOutcome({ cascadeFrames: null })).ok).toBe(true)
        expect(validateQueuedOutcome(validOutcome({ wildIndexes: null })).ok).toBe(true)
    })

    it('snapshots the outcome so later caller mutation cannot change what settles', () => {
        const source = validOutcome({ multiplier: 2 })
        const result = validateQueuedOutcome(source)
        source.multiplier = 999
        expect(result.value.multiplier).toBe(2)
    })
})

describe('validateFreeSpinSession', () => {
    it('accepts a well-formed session', () => {
        expect(validateFreeSpinSession(validSession()).ok).toBe(true)
    })

    it('accepts null to clear the session', () => {
        const result = validateFreeSpinSession(null)
        expect(result.ok).toBe(true)
        expect(result.value).toBeNull()
    })

    it.each([['undefined', undefined], ['an array', []], ['a string', 'x']])(
        'rejects %s',
        (_label, input) => {
            expect(validateFreeSpinSession(input).ok).toBe(false)
        },
    )

    it('rejects played greater than totalAwarded', () => {
        const result = validateFreeSpinSession(validSession({ totalAwarded: 5, played: 6 }))
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/played/)
    })

    it('accepts played equal to totalAwarded (an exhausted session)', () => {
        expect(validateFreeSpinSession(validSession({ totalAwarded: 5, played: 5 })).ok).toBe(true)
    })

    it('rejects totalAwarded above the cap', () => {
        expect(
            validateFreeSpinSession(validSession({ totalAwarded: MAX_FREE_SPINS_PER_SESSION + 1 })).ok,
        ).toBe(false)
    })

    it('rejects negative or fractional counters', () => {
        expect(validateFreeSpinSession(validSession({ totalAwarded: -1 })).ok).toBe(false)
        expect(validateFreeSpinSession(validSession({ played: -1 })).ok).toBe(false)
        expect(validateFreeSpinSession(validSession({ played: 1.5 })).ok).toBe(false)
    })

    it('rejects non-finite or negative money fields', () => {
        for (const bad of [NaN, Infinity, '5', null, -1]) {
            expect(validateFreeSpinSession(validSession({ totalWin: bad })).ok).toBe(false)
            expect(validateFreeSpinSession(validSession({ baseBet: bad })).ok).toBe(false)
        }
    })

    it('treats retriggers as optional but validated when present', () => {
        expect(validateFreeSpinSession(validSession({ retriggers: undefined })).ok).toBe(true)
        expect(validateFreeSpinSession(validSession({ retriggers: -1 })).ok).toBe(false)
    })
})

describe('createOutcomeQueue', () => {
    it('starts empty and consumes to null so the real resolver runs', () => {
        const queue = createOutcomeQueue()
        expect(queue.size()).toBe(0)
        expect(queue.consume()).toBeNull()
    })

    it('consumes queued outcomes in FIFO order', () => {
        const queue = createOutcomeQueue()
        queue.enqueue(validOutcome({ multiplier: 1 }))
        queue.enqueue(validOutcome({ multiplier: 2 }))
        queue.enqueue(validOutcome({ multiplier: 3 }))
        expect([queue.consume().multiplier, queue.consume().multiplier, queue.consume().multiplier])
            .toEqual([1, 2, 3])
    })

    // The core safety property: a fixture must not silently repeat.
    it('consumes each outcome exactly once, then falls back to null', () => {
        const queue = createOutcomeQueue()
        queue.enqueue(validOutcome({ multiplier: 7 }))
        expect(queue.consume().multiplier).toBe(7)
        expect(queue.consume()).toBeNull()
        expect(queue.consume()).toBeNull()
    })

    it('does not mutate the queue when a fixture is rejected', () => {
        const queue = createOutcomeQueue()
        queue.enqueue(validOutcome({ multiplier: 1 }))
        const before = queue.size()

        const rejected = queue.enqueue(validOutcome({ multiplier: NaN }))
        expect(rejected.ok).toBe(false)
        expect(queue.size()).toBe(before)

        // The surviving entry is still the good one, uncorrupted.
        expect(queue.consume().multiplier).toBe(1)
        expect(queue.consume()).toBeNull()
    })

    it('reports queue depth on success', () => {
        const queue = createOutcomeQueue()
        expect(queue.enqueue(validOutcome()).value.queued).toBe(1)
        expect(queue.enqueue(validOutcome()).value.queued).toBe(2)
    })

    it('clears pending outcomes and reports how many were dropped', () => {
        const queue = createOutcomeQueue()
        queue.enqueue(validOutcome())
        queue.enqueue(validOutcome())
        expect(queue.clear()).toBe(2)
        expect(queue.size()).toBe(0)
        expect(queue.consume()).toBeNull()
    })

    it('isolates queues from each other', () => {
        const a = createOutcomeQueue()
        const b = createOutcomeQueue()
        a.enqueue(validOutcome({ multiplier: 4 }))
        expect(b.size()).toBe(0)
        expect(b.consume()).toBeNull()
        expect(a.consume().multiplier).toBe(4)
    })
})
