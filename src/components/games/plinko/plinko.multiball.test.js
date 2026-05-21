import { describe, it, expect } from 'vitest'

// Plinko multi-ball settle map: each in-flight ball has its own promise
// resolved when its `ballId` reports back. This exercises the same Map
// pattern used in PlinkoGame.jsx without spinning the canvas engine.

describe('plinko multi-ball settle map', () => {
    it('settles each ball with its own resolver', () => {
        const settleByIdRef = { current: new Map() }
        const seen = []
        const resolve = (id) => seen.push(id)

        for (let i = 0; i < 5; i++) {
            const ballId = `b${i}`
            settleByIdRef.current.set(ballId, () => resolve(ballId))
        }
        // Engine fires onBallEnterBin out of order:
        const order = ['b2', 'b0', 'b4', 'b1', 'b3']
        for (const id of order) {
            const settle = settleByIdRef.current.get(id)
            settleByIdRef.current.delete(id)
            settle?.()
        }
        expect(seen).toEqual(order)
        expect(settleByIdRef.current.size).toBe(0)
    })

    it('does not double-resolve the same ball', () => {
        const map = new Map()
        let calls = 0
        map.set('only', () => { calls += 1 })
        const fn = map.get('only'); map.delete('only'); fn?.()
        const fn2 = map.get('only'); map.delete('only'); fn2?.()
        expect(calls).toBe(1)
    })

    it('handles 50 simultaneous in-flight settles without contention', () => {
        const map = new Map()
        const got = []
        for (let i = 0; i < 50; i++) {
            map.set(`x${i}`, () => got.push(i))
        }
        // All resolve in same tick.
        for (const [id, fn] of [...map.entries()]) {
            map.delete(id)
            fn()
        }
        expect(got.length).toBe(50)
        expect(map.size).toBe(0)
    })
})
