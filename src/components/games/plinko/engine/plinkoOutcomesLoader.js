const DEFAULT_BASE_URL = '/data/plinko/outcomes'
const MIN_ROWS = 8
const MAX_ROWS = 16

function normalizeRowCount(rowCount) {
    const parsed = Number(rowCount) || MAX_ROWS
    return Number.isInteger(parsed) && parsed >= MIN_ROWS && parsed <= MAX_ROWS
        ? parsed
        : null
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function validateOutcomes(data, rowCount) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new TypeError(`Invalid Plinko outcomes for ${rowCount} rows`)
    }

    for (let binIndex = 0; binIndex <= rowCount; binIndex += 1) {
        const positions = data[binIndex]
        if (!Array.isArray(positions) || positions.some(position => !Number.isFinite(position))) {
            throw new TypeError(`Invalid Plinko outcomes for ${rowCount} rows at bin ${binIndex}`)
        }
    }

    return data
}

export function createOutcomesLoader({ fetchImpl = globalThis.fetch, baseUrl = DEFAULT_BASE_URL } = {}) {
    const dataCache = new Map()
    const pendingCache = new Map()
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

    async function loadOutcomes(rowCount) {
        const key = normalizeRowCount(rowCount)
        if (key === null) return null
        if (dataCache.has(key)) return dataCache.get(key)
        if (pendingCache.has(key)) return pendingCache.get(key)
        if (typeof fetchImpl !== 'function') {
            throw new TypeError('Plinko outcomes require a fetch implementation')
        }

        const request = (async () => {
            const response = await fetchImpl(`${normalizedBaseUrl}/rows-${key}.json`, {
                headers: { accept: 'application/json' },
            })
            if (!response?.ok) {
                throw new Error(`Unable to load Plinko outcomes for ${key} rows (${response?.status || 'network error'})`)
            }
            const data = validateOutcomes(await response.json(), key)
            dataCache.set(key, data)
            return data
        })()

        pendingCache.set(key, request)
        try {
            return await request
        } finally {
            pendingCache.delete(key)
        }
    }

    function getCachedOutcomes(rowCount) {
        const key = normalizeRowCount(rowCount)
        return key === null ? null : dataCache.get(key) || null
    }

    function preloadOutcomes(rowCounts = [MAX_ROWS]) {
        return Promise.all(rowCounts.map(loadOutcomes))
    }

    return { loadOutcomes, getCachedOutcomes, preloadOutcomes }
}

const defaultLoader = createOutcomesLoader()

export const loadOutcomes = defaultLoader.loadOutcomes
export const getCachedOutcomes = defaultLoader.getCachedOutcomes
export const preloadOutcomes = defaultLoader.preloadOutcomes
