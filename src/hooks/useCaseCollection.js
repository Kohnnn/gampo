// useCaseCollection — Wave 31 rewrite for the full CS2 collection catalog.
//
// Drops every collected skin into a discovered map keyed by `skinId+wear+stattrak`
// so float/wear/StatTrak/souvenir variants count as separate collection entries.
// Every roll permanently adds to the collection (no cap, no pruning).
//
// Storage:
//   gampo_cases_drops_v2     — last N=400 drops, newest-first
//   gampo_cases_pokedex      — { [variantKey]: { count, name, image, rarity, color,
//                                                wear, float, statTrak, souvenir,
//                                                multiplier, valueGc, firstSeen, lastSeen, skinId } }
//
// Variant key shape: `${skinId}::${wear}::${statTrak ? 'st' : 'reg'}::${souvenir ? 'sv' : 'std'}`.
//
// Collection entries also store representative `multiplier` and `valueGc`
// values so the collection summary can show best hit and total inventory value.
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

function makeDropId(entry = {}, index = 0) {
    if (entry.dropId) return entry.dropId
    const stamp = entry.ts || 0
    const key = entry.key || entry.variantKey || entry.skinId || 'drop'
    return `${stamp}::${key}::${index}`
}

function normalizeDrop(entry, index) {
    return {
        ...entry,
        dropId: makeDropId(entry, index),
        favorite: !!entry.favorite,
        archived: !!entry.archived,
    }
}

function readDrops() {
    try {
        const raw = localStorage.getItem(DROPS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.map(normalizeDrop) : []
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
    const ts = Date.now()
    const entry = {
        dropId: `${ts}-${Math.random().toString(16).slice(2, 8)}`,
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
        valueGc: pick.valueGc,
        openPriceGc: ctx.openPriceGc,
        profitGc: pick.profitGc,
        ts,
        caseId: ctx.caseId,
        caseName: ctx.caseName,
        favorite: false,
        archived: false,
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
            valueGc: Math.max(prev.valueGc || 0, pick.valueGc || 0),
            totalValueGc: (prev.totalValueGc || 0) + (Number(pick.valueGc) || 0),
            count: (prev.count || 0) + 1,
            firstSeen: prev.firstSeen || ts,
            lastSeen: ts,
        },
    }
    writeDrops()
    writePokedex()
    notify()
}

function patchDrop(dropId, patch) {
    let changed = false
    drops = drops.map((drop, index) => {
        const normalized = normalizeDrop(drop, index)
        if (normalized.dropId !== dropId) return normalized
        changed = true
        return { ...normalized, ...patch }
    })
    if (changed) {
        writeDrops()
        notify()
    }
    return changed
}

export function toggleFavorite(dropId) {
    const drop = drops.find((entry, index) => normalizeDrop(entry, index).dropId === dropId)
    if (!drop) return false
    return patchDrop(dropId, { favorite: !drop.favorite })
}

export function archiveDrop(dropId) {
    return patchDrop(dropId, { archived: true })
}

export function restoreDrop(dropId) {
    return patchDrop(dropId, { archived: false })
}

export function removeJunk({ maxValueGc = 1.5, keepPerVariant = 1 } = {}) {
    const seen = new Map()
    let archivedCount = 0
    drops = drops.map((drop, index) => {
        const normalized = normalizeDrop(drop, index)
        if (normalized.archived || normalized.favorite) return normalized
        const key = normalized.key || variantKey(normalized)
        const count = seen.get(key) || 0
        seen.set(key, count + 1)
        const lowValue = (Number(normalized.valueGc) || 0) <= maxValueGc
        if (lowValue && count >= keepPerVariant) {
            archivedCount += 1
            return { ...normalized, archived: true }
        }
        return normalized
    })
    if (archivedCount > 0) {
        writeDrops()
        notify()
    }
    return archivedCount
}

export function exportInventory() {
    return JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        drops: drops.map(normalizeDrop),
        pokedex,
    }, null, 2)
}

export function importInventory(payload) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (!parsed || !Array.isArray(parsed.drops) || !parsed.pokedex || typeof parsed.pokedex !== 'object') {
        throw new Error('Invalid cases inventory export')
    }
    drops = parsed.drops.map(normalizeDrop).slice(0, DROPS_LIMIT)
    pokedex = parsed.pokedex
    writeDrops()
    writePokedex()
    notify()
    return { drops: drops.length, variants: Object.keys(pokedex).length }
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
    const activeDrops = drops.filter(drop => !drop.archived)
    const archivedDrops = drops.filter(drop => drop.archived)
    const favoriteDrops = drops.filter(drop => drop.favorite && !drop.archived)
    let bestMultiplier = 0
    let bestValueGc = 0
    let totalValueGc = 0
    let bestSkin = null
    for (const skin of list) {
        totalValueGc += Number(skin.totalValueGc ?? skin.valueGc ?? 0) || 0
        if ((skin.valueGc || 0) > bestValueGc) bestValueGc = skin.valueGc || 0
        if ((skin.multiplier || 0) > bestMultiplier) {
            bestMultiplier = skin.multiplier
            bestSkin = skin
        }
    }
    return {
        totalDrops: drops.length,
        activeDrops: activeDrops.length,
        archivedDrops: archivedDrops.length,
        favoriteDrops: favoriteDrops.length,
        uniqueVariants: list.length,
        catalogTotal,
        completionPct: catalogTotal > 0 ? Math.min(100, Math.round((list.length / catalogTotal) * 100)) : 0,
        bestMultiplier,
        bestValueGc,
        totalValueGc,
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
        toggleFavorite,
        archiveDrop,
        restoreDrop,
        removeJunk,
        exportInventory,
        importInventory,
    }
}
