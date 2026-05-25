// useCsCollection — Wave 31 catalog loader for the full CS2 pokedex.
//
// Lazy-fetches `/data/cs-collection.json` once per session and caches it
// in module scope. The dataset is ~8 MB so we only pull it when the
// Pokedex tab is opened. Cases-only games keep using the smaller
// `/data/cs-cases.json` (~390 KB) loaded inside CasesGame directly.
//
// Exposes:
//   const { catalog, loaded, loading, error } = useCsCollection()
//   catalog.skins[skinId]            -> full skin record (rarity, wears, etc.)
//   catalog.crates                    -> array of crates
//   catalog.totalSkins / totalEntries -> headline counters

import { useEffect, useState } from 'react'

let cached = null
let loadingPromise = null
const listeners = new Set()

function notify() {
    listeners.forEach(fn => fn())
}

async function load() {
    if (cached) return cached
    if (loadingPromise) return loadingPromise
    loadingPromise = (async () => {
        try {
            const res = await fetch('/data/cs-collection.json')
            if (!res.ok) throw new Error(`cs-collection.json ${res.status}`)
            const data = await res.json()
            cached = data
            notify()
            return data
        } catch (err) {
            cached = { error: err }
            notify()
            return cached
        } finally {
            loadingPromise = null
        }
    })()
    return loadingPromise
}

export function useCsCollection() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        if (!cached) load()
        return () => { listeners.delete(fn) }
    }, [])
    return {
        catalog: cached && !cached.error ? cached : null,
        loaded: !!cached && !cached.error,
        loading: !cached && !!loadingPromise,
        error: cached?.error || null,
    }
}

export function ensureCatalog() {
    return load()
}
