// useCaseCollection — Wave 31 rewrite for the full CS2 pokedex catalog.
//
// Drops every collected skin into a discovered map keyed by `skinId+wear+stattrak`
// so float/wear/StatTrak/souvenir variants count as separate "Pokedex" entries.
// Every roll permanently adds to the collection (no cap, no pruning).
//
// Storage:
//   gampo_cases_drops_v2     — last N=400 drops, newest-first
//   gampo_cases_pokedex      — { [variantKey]: { count, name, image, rarity, color,
//                                                wear, float, statTrak, souvenir,
//                                                multiplier, firstSeen, lastSeen, skinId } }
//
// Variant key shape: `${skinId}::${wear}::${statTrak ? 'st' : 'reg'}::${souvenir ? 'sv' : 'std'}`.
//
// Pokedex entries also store a representative `multiplier` so the collection
// summary can show best-multiplier-ever.
//
// Backwards compatibility: Wave 18 used `gampo_cases_drops` and
// `gampo_cases_collection`. We keep them readable but ignore them; the new
// keys carry the v2 dataset so older drops show as ‘legacy’ if migrated.

import { useEffect, useState } from 'react'

const DROPS_KEY = 'gampo_cases_drops_v2'
const POKEDEX_KEY = 'gampo_cases_pokedex'
const DROPS_LIMIT = 400

const listeners = new Set()
let drops = readDrops()
let pokedex = readPokedex()

function readDrops() {
    try {
        const raw = localStorage.getItem(DROPS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function readPokedex() {
    try {
        const raw = localStorage.getItem(POKEDEX_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function writeDrops() {
    try {
        const trimmed = drops.slice(0, DROPS_LIMIT)
        localStorage.setItem(DROPS_KEY, JSON.stringify(trimmed))
        drops = trimmed
    } catch { /* quota / private mode */ }
}

function writePokedex() {
    try {
        localStorage.setItem(POKEDEX_KEY, JSON.stringify(pokedex))
    } catch { /* ignore */ }
}

function notify() {
    listeners.forEach(fn => fn())
}

export function variantKey({ skinId, wear, statTrak, souvenir }) {
    return `${skinId}::${wear || 'NA'}::${statTrak ? 'st' : 'reg'}::${souvenir ? 'sv' : 'std'}`
}

export function recordDrop(pick, ctx = {}) {
    if (!pick || !pick.skinId) return
    const key = variantKey(pick)
    const entry = {
        key,
        skinId: pick.skinId,
        name: pick.name,
        image: pick.image,
        color: pick.color,
        rarity: pick.rarity,
        wear: pick.wear,
        wearShort: pick.wearShort,
        float: pick.float,
        statTrak: !!pick.statTrak,
        souvenir: !!pick.souvenir,
        multiplier: pick.multiplier,
        ts: Date.now(),
        caseId: ctx.caseId,
        caseName: ctx.caseName,
    }
    drops = [entry, ...drops].slice(0, DROPS_LIMIT)
    const prev = pokedex[key] || { count: 0 }
    pokedex = {
        ...pokedex,
        [key]: {
            key,
            skinId: pick.skinId,
            name: pick.name,
            image: pick.image,
            color: pick.color,
            rarity: pick.rarity,
            wear: pick.wear,
            wearShort: pick.wearShort,
            float: prev.count > 0 ? prev.float : pick.float,
            bestFloat: prev.count > 0 ? Math.min(prev.bestFloat ?? prev.float, pick.float) : pick.float,
            statTrak: !!pick.statTrak,
            souvenir: !!pick.souvenir,
            multiplier: Math.max(prev.multiplier || 0, pick.multiplier || 0),
            count: (prev.count || 0) + 1,
            firstSeen: prev.firstSeen || Date.now(),
            lastSeen: Date.now(),
        },
    }
    writeDrops()
    writePokedex()
    notify()
}

export function resetCases() {
    drops = []
    pokedex = {}
    try {
        localStorage.removeItem(DROPS_KEY)
        localStorage.removeItem(POKEDEX_KEY)
    } catch { /* ignore */ }
    notify()
}

function summarise(catalogTotal = 0) {
    const list = Object.values(pokedex)
    let bestMultiplier = 0
    let bestSkin = null
    for (const skin of list) {
        if ((skin.multiplier || 0) > bestMultiplier) {
            bestMultiplier = skin.multiplier
            bestSkin = skin
        }
    }
    return {
        totalDrops: drops.length,
        uniqueVariants: list.length,
        catalogTotal,
        completionPct: catalogTotal > 0 ? Math.min(100, Math.round((list.length / catalogTotal) * 100)) : 0,
        bestMultiplier,
        bestSkin,
    }
}

export function useCaseCollection({ catalogTotal = 0 } = {}) {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        drops,
        pokedex,
        summary: summarise(catalogTotal),
        recordDrop,
        reset: resetCases,
    }
}
