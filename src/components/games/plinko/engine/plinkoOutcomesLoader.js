// Lazy-loads per-row Plinko outcome tables.
// Each rows-N.js is ~1.8 MB; we only fetch the active row count.
// PlinkoEngine awaits this loader during construction and after row-count switches.

const cache = new Map()

const loaders = {
    8: () => import('./outcomes/rows-8.js'),
    9: () => import('./outcomes/rows-9.js'),
    10: () => import('./outcomes/rows-10.js'),
    11: () => import('./outcomes/rows-11.js'),
    12: () => import('./outcomes/rows-12.js'),
    13: () => import('./outcomes/rows-13.js'),
    14: () => import('./outcomes/rows-14.js'),
    15: () => import('./outcomes/rows-15.js'),
    16: () => import('./outcomes/rows-16.js'),
}

export async function loadOutcomes(rowCount) {
    const key = Number(rowCount) || 16
    if (cache.has(key)) return cache.get(key)
    const loader = loaders[key]
    if (!loader) {
        cache.set(key, null)
        return null
    }
    const mod = await loader()
    const data = mod.default || mod
    cache.set(key, data)
    return data
}

export function getCachedOutcomes(rowCount) {
    return cache.get(Number(rowCount) || 16) || null
}

export function preloadOutcomes(rowCounts = [16]) {
    return Promise.all(rowCounts.map(loadOutcomes))
}
