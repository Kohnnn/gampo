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
//   gampo_cases_stats_v1     — { [caseId]: { caseId, caseName, opens, totalWageredGc,
//                                            totalReturnGc, netGc, luckiest, lastOpened } }
//
// Per-case stats live in their own versioned key (not derived from `drops`)
// because the drop history is capped at 400 entries — lifetime open counts,
// wagered totals and net P/L must survive beyond that window, so we accumulate
// them eagerly on every recordDrop.
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
import { readJson, writeJson, removeKey } from '../utils/storage'

const DROPS_KEY = 'gampo_cases_drops_v2'
const POKEDEX_KEY = 'gampo_cases_pokedex'
const CASE_STATS_KEY = 'gampo_cases_stats_v1'
const DROPS_LIMIT = 400

const listeners = new Set()
let drops = readDrops()
let pokedex = readPokedex()
let caseStats = readCaseStats()

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
    const parsed = readJson(DROPS_KEY, [])
    return Array.isArray(parsed) ? parsed.map(normalizeDrop) : []
}

function readPokedex() {
    const parsed = readJson(POKEDEX_KEY, {})
    return parsed && typeof parsed === 'object' ? parsed : {}
}

function readCaseStats() {
    const parsed = readJson(CASE_STATS_KEY, {})
    return parsed && typeof parsed === 'object' ? parsed : {}
}

function writeDrops() {
    const trimmed = drops.slice(0, DROPS_LIMIT)
    if (writeJson(DROPS_KEY, trimmed)) {
        drops = trimmed
    }
}

function writePokedex() {
    writeJson(POKEDEX_KEY, pokedex)
}

function writeCaseStats() {
    writeJson(CASE_STATS_KEY, caseStats)
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
    accumulateCaseStats(pick, ctx, ts)
    notify()
}

// Per-case lifetime aggregates. Keyed by case id. Tracks how many drops were
// opened from the case, total wagered (sum of per-drop open price), total value
// returned, net P/L (return - wagered), and the single luckiest drop seen
// (highest value, ties broken by multiplier). Accumulated eagerly so the totals
// survive the 400-drop history cap.
function accumulateCaseStats(pick, ctx, ts) {
    const caseId = ctx.caseId
    if (!caseId) return
    const wagered = Number(ctx.openPriceGc ?? pick.openPriceGc) || 0
    const value = Number(pick.valueGc) || 0
    const prev = caseStats[caseId] || {
        caseId,
        caseName: ctx.caseName || pick.caseName || caseId,
        opens: 0,
        totalWageredGc: 0,
        totalReturnGc: 0,
        netGc: 0,
        luckiest: null,
        lastOpened: 0,
    }
    const prevLuckyValue = prev.luckiest ? Number(prev.luckiest.valueGc) || 0 : -Infinity
    const prevLuckyMult = prev.luckiest ? Number(prev.luckiest.multiplier) || 0 : -Infinity
    const mult = Number(pick.multiplier) || 0
    const isLuckier = value > prevLuckyValue || (value === prevLuckyValue && mult > prevLuckyMult)
    const luckiest = isLuckier
        ? {
            skinId: pick.skinId,
            name: pick.name,
            image: pick.image,
            color: pick.color,
            rarity: pick.rarity,
            wear: pick.wear,
            statTrak: !!pick.statTrak,
            souvenir: !!pick.souvenir,
            valueGc: value,
            multiplier: mult,
            ts,
        }
        : prev.luckiest
    const totalWageredGc = (Number(prev.totalWageredGc) || 0) + wagered
    const totalReturnGc = (Number(prev.totalReturnGc) || 0) + value
    caseStats = {
        ...caseStats,
        [caseId]: {
            ...prev,
            caseName: ctx.caseName || prev.caseName,
            opens: (Number(prev.opens) || 0) + 1,
            totalWageredGc: Math.round(totalWageredGc * 100) / 100,
            totalReturnGc: Math.round(totalReturnGc * 100) / 100,
            netGc: Math.round((totalReturnGc - totalWageredGc) * 100) / 100,
            luckiest,
            lastOpened: ts,
        },
    }
    writeCaseStats()
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
        caseStats,
    }, null, 2)
}

export function importInventory(payload) {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (!parsed || !Array.isArray(parsed.drops) || !parsed.pokedex || typeof parsed.pokedex !== 'object') {
        throw new Error('Invalid cases inventory export')
    }
    drops = parsed.drops.map(normalizeDrop).slice(0, DROPS_LIMIT)
    pokedex = parsed.pokedex
    caseStats = parsed.caseStats && typeof parsed.caseStats === 'object' ? parsed.caseStats : {}
    writeDrops()
    writePokedex()
    writeCaseStats()
    notify()
    return { drops: drops.length, variants: Object.keys(pokedex).length }
}

export function resetCases() {
    drops = []
    pokedex = {}
    caseStats = {}
    removeKey(DROPS_KEY)
    removeKey(POKEDEX_KEY)
    removeKey(CASE_STATS_KEY)
    notify()
}

// Lifetime open stats for a single case id (or null if never opened).
export function caseStatsFor(caseId) {
    if (!caseId) return null
    return caseStats[caseId] || null
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
        caseStats,
        summary: summarise(catalogTotal),
        recordDrop,
        reset: resetCases,
        toggleFavorite,
        archiveDrop,
        restoreDrop,
        removeJunk,
        exportInventory,
        importInventory,
        caseStatsFor,
    }
}
