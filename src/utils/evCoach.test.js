import { describe, it, expect } from 'vitest'
import { buildEvCoach, EV_VERDICT_LABELS } from './evCoach'

const def = { name: 'Dice', rtp: 0.99, houseEdge: 0.01, volatility: 'medium', lesson: 'EV is negative.' }

describe('buildEvCoach', () => {
    it('computes theoretical EV per unit and per play', () => {
        const c = buildEvCoach(def, {}, 10)
        expect(c.theoretical.rtp).toBe(0.99)
        expect(c.theoretical.evPerUnit).toBe(-0.01)
        expect(c.theoretical.evPerPlay).toBe(-0.1)
    })

    it('marks results unreliable below 20 rounds', () => {
        const c = buildEvCoach(def, { count: 5, wagered: 50, returned: 60, profit: 10 }, 10)
        expect(c.observed.reliable).toBe(false)
        expect(c.verdict).toBe('even')
        expect(c.note).toMatch(/at least 20 rounds/i)
    })

    it('detects running-hot vs the model with enough samples', () => {
        const c = buildEvCoach(def, { count: 50, wagered: 500, returned: 600, profit: 100 }, 10)
        expect(c.observed.rtp).toBe(1.2)
        expect(c.verdict).toBe('running-hot')
        expect(c.observed.luckDeltaPts).toBeGreaterThan(0)
    })

    it('detects running-cold', () => {
        const c = buildEvCoach(def, { count: 50, wagered: 500, returned: 400, profit: -100 }, 10)
        expect(c.verdict).toBe('running-cold')
    })

    it('detects on-model when close to theoretical', () => {
        const c = buildEvCoach(def, { count: 80, wagered: 800, returned: 792, profit: -8 }, 10)
        expect(c.verdict).toBe('on-model')
    })

    it('handles missing definition fields with defaults', () => {
        const c = buildEvCoach({}, {}, 0)
        expect(c.theoretical.rtp).toBe(0.99)
        expect(c.observed.rtp).toBeNull()
    })

    it('exposes verdict labels', () => {
        expect(EV_VERDICT_LABELS['on-model']).toBeTruthy()
    })

    it('flags multi-bet games and adds a clarifying note', () => {
        const roulette = buildEvCoach({ id: 'roulette', rtp: 0.973, houseEdge: 0.027 }, {}, 5)
        expect(roulette.multiBet).toBe(true)
        expect(roulette.note).toMatch(/several bet types/i)

        const explicit = buildEvCoach({ name: 'Custom', multiBet: true, rtp: 0.95 }, {}, 5)
        expect(explicit.multiBet).toBe(true)
    })

    it('does not flag single-bet games', () => {
        const dice2 = buildEvCoach({ id: 'dice', rtp: 0.99, houseEdge: 0.01 }, {}, 5)
        expect(dice2.multiBet).toBe(false)
        expect(dice2.note).not.toMatch(/several bet types/i)
    })
})
