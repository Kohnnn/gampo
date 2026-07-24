import { describe, expect, it, vi } from 'vitest'
import { createOutcomesLoader } from './plinkoOutcomesLoader'

function outcomesFor(rowCount) {
    return Object.fromEntries(
        Array.from({ length: rowCount + 1 }, (_, binIndex) => [binIndex, [rowCount * 1000 + binIndex]]),
    )
}

function responseWith(data, { ok = true, status = 200 } = {}) {
    return { ok, status, json: vi.fn(async () => data) }
}

describe('plinkoOutcomesLoader', () => {
    it('fetches the requested static JSON table without changing its lookup shape', async () => {
        const expected = outcomesFor(8)
        const fetchImpl = vi.fn(async () => responseWith(expected))
        const loader = createOutcomesLoader({ fetchImpl, baseUrl: '/fixtures/plinko/' })

        const loaded = await loader.loadOutcomes(8)

        expect(fetchImpl).toHaveBeenCalledWith('/fixtures/plinko/rows-8.json', {
            headers: { accept: 'application/json' },
        })
        expect(loaded).toBe(expected)
        expect(loaded[3][0]).toBe(8003)
    })

    it('deduplicates concurrent loads and serves later reads from cache', async () => {
        const expected = outcomesFor(12)
        const fetchImpl = vi.fn(async () => responseWith(expected))
        const loader = createOutcomesLoader({ fetchImpl })

        const [first, second] = await Promise.all([
            loader.loadOutcomes(12),
            loader.loadOutcomes(12),
        ])
        const third = await loader.loadOutcomes(12)

        expect(first).toBe(expected)
        expect(second).toBe(expected)
        expect(third).toBe(expected)
        expect(loader.getCachedOutcomes(12)).toBe(expected)
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('reports HTTP failures and retries instead of caching the rejection', async () => {
        const expected = outcomesFor(10)
        const fetchImpl = vi
            .fn()
            .mockResolvedValueOnce(responseWith(null, { ok: false, status: 503 }))
            .mockResolvedValueOnce(responseWith(expected))
        const loader = createOutcomesLoader({ fetchImpl })

        await expect(loader.loadOutcomes(10)).rejects.toThrow('Unable to load Plinko outcomes for 10 rows (503)')
        await expect(loader.loadOutcomes(10)).resolves.toBe(expected)
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('rejects malformed tables and leaves the cache empty', async () => {
        const malformed = outcomesFor(9)
        delete malformed[4]
        const loader = createOutcomesLoader({ fetchImpl: vi.fn(async () => responseWith(malformed)) })

        await expect(loader.loadOutcomes(9)).rejects.toThrow('Invalid Plinko outcomes for 9 rows at bin 4')
        expect(loader.getCachedOutcomes(9)).toBeNull()
    })

    it('preserves the legacy row normalization and unsupported-row behavior', async () => {
        const expected = outcomesFor(16)
        const fetchImpl = vi.fn(async () => responseWith(expected))
        const loader = createOutcomesLoader({ fetchImpl })

        await expect(loader.loadOutcomes('not-a-number')).resolves.toBe(expected)
        await expect(loader.loadOutcomes(7)).resolves.toBeNull()
        await expect(loader.loadOutcomes(17)).resolves.toBeNull()
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl.mock.calls[0][0]).toBe('/data/plinko/outcomes/rows-16.json')
    })
})
