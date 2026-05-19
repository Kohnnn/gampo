// Lazy loader for the precomputed Plinko outcomes table.
// The full lookup is ~16 MB and lives at /data/plinkoOutcomes.json.
// We fetch it on first use, cache the parsed result in memory, and resolve
// per-row data once available.

let outcomesPromise = null
let outcomesCache = null

export function getOutcomesSync() {
    return outcomesCache
}

export async function loadOutcomes() {
    if (outcomesCache) return outcomesCache
    if (!outcomesPromise) {
        outcomesPromise = fetch('/data/plinkoOutcomes.json')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                outcomesCache = data
                return data
            })
            .catch(() => null)
    }
    return outcomesPromise
}

// Fire on module import so the data is ready when the user actually drops a ball.
if (typeof window !== 'undefined') {
    loadOutcomes()
}
