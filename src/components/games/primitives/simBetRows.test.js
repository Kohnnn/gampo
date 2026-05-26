import { describe, expect, it } from 'vitest'
import { fakePlayers } from '../../../context/SocialContext'
import {
    clampSimRows,
    makeInitialSimBetRows,
    makeSimBetRow,
    personaSimProfile,
    prependSimBetRow,
} from './simBetRows'

describe('sim bet rows', () => {
    it('biases whale personas toward larger stakes and longer targets than cautious players', () => {
        const whale = { id: 'test-whale', name: 'big_stack', persona: 'whale' }
        const cautious = { id: 'test-cautious', name: 'small_stack', persona: 'cautious' }

        const whaleRow = makeSimBetRow('limbo', { player: whale, seed: 'persona-bias' })
        const cautiousRow = makeSimBetRow('limbo', { player: cautious, seed: 'persona-bias' })

        expect(personaSimProfile('whale').risk).toBeGreaterThan(personaSimProfile('cautious').risk)
        expect(whaleRow.stake).toBeGreaterThan(cautiousRow.stake)
        expect(whaleRow.meta.target).toBeGreaterThan(cautiousRow.meta.target)
    })

    it('uses the shared roster and caps visible rows deterministically', () => {
        const rosterNames = new Set(fakePlayers.map(player => player.name))
        const rows = makeInitialSimBetRows('plinko', { seed: 'cap-test', count: 18, cap: 12 })

        expect(rows).toHaveLength(12)
        expect(rows.every(row => rosterNames.has(row.name))).toBe(true)
        expect(new Set(rows.map(row => row.playerId)).size).toBeGreaterThanOrEqual(10)

        const next = makeSimBetRow('plinko', { seed: 'next-row', rows: 16, risk: 'high' })
        const capped = prependSimBetRow(rows, next, 10)

        expect(capped).toHaveLength(10)
        expect(capped[0]).toEqual(next)
        expect(clampSimRows(rows, 8)).toHaveLength(8)
    })
})
