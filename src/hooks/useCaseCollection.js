// useCaseCollection — localStorage-backed drop history + owned-skin collection
// for the CS-style cases game (Wave 18).
//
// Keys:
//   gampo_cases_drops     — last N=200 drops, newest-first
//   gampo_cases_collection — { [skinId]: { count, name, image, color, rarity, multiplier, lastSeen } }
//
// API:
//   const cases = useCaseCollection()
//   cases.drops              -> array of recent drops (newest first)
//   cases.collection         -> map of owned skins
//   cases.summary            -> { totalDrops, uniqueSkins, bestMultiplier, bestSkin }
//   cases.recordDrop(pick)   -> append a drop record + bump collection count
//   cases.reset()            -> wipe both stores

import { useEffect, useState } from 'react'

const DROPS_KEY = 'gampo_cases_drops'
const COLLECTION_KEY = 'gampo_cases_collection'
const DROPS_LIMIT = 200

const listeners = new Set()
let drops = readDrops()
let collection = readCollection()

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

function readCollection() {
    try {
        const raw = localStorage.getItem(COLLECTION_KEY)
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

function writeCollection() {
    try {
        localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection))
    } catch { /* ignore */ }
}

function notify() {
    listeners.forEach(fn => fn())
}

export function recordDrop(pick, ctx = {}) {
    if (!pick || !pick.id) return
    const entry = {
        id: pick.id,
        name: pick.name,
        image: pick.image,
        color: pick.color,
        rarity: pick.rarity,
        multiplier: pick.multiplier,
        ts: Date.now(),
        caseId: ctx.caseId,
        caseName: ctx.caseName,
        tier: ctx.tier,
    }
    drops = [entry, ...drops].slice(0, DROPS_LIMIT)
    const key = pick.id
    const prev = collection[key] || { count: 0 }
    collection = {
        ...collection,
        [key]: {
            id: pick.id,
            name: pick.name,
            image: pick.image,
            color: pick.color,
            rarity: pick.rarity,
            multiplier: Math.max(prev.multiplier || 0, pick.multiplier || 0),
            count: (prev.count || 0) + 1,
            firstSeen: prev.firstSeen || Date.now(),
            lastSeen: Date.now(),
        },
    }
    writeDrops()
    writeCollection()
    notify()
}

export function resetCases() {
    drops = []
    collection = {}
    try {
        localStorage.removeItem(DROPS_KEY)
        localStorage.removeItem(COLLECTION_KEY)
    } catch { /* ignore */ }
    notify()
}

function summarise() {
    const collectionList = Object.values(collection)
    let bestMultiplier = 0
    let bestSkin = null
    for (const skin of collectionList) {
        if ((skin.multiplier || 0) > bestMultiplier) {
            bestMultiplier = skin.multiplier
            bestSkin = skin
        }
    }
    return {
        totalDrops: drops.length,
        uniqueSkins: collectionList.length,
        bestMultiplier,
        bestSkin,
    }
}

export function useCaseCollection() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        drops,
        collection,
        summary: summarise(),
        recordDrop,
        reset: resetCases,
    }
}
