import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
})

describe('useCsCollection loader', () => {
    it('does not fetch the full collection catalog on module import', async () => {
        const fetchMock = vi.fn()
        globalThis.fetch = fetchMock

        await import('./useCsCollection')

        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('loads and caches cs-collection.json when explicitly requested', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ totalSkins: 2, skins: { a: {}, b: {} } }),
        })
        globalThis.fetch = fetchMock

        const { ensureCatalog } = await import('./useCsCollection')
        const first = await ensureCatalog()
        const second = await ensureCatalog()

        expect(first.totalSkins).toBe(2)
        expect(second).toBe(first)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith('/data/cs-collection.json')
    })
})
