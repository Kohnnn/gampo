// useRewards — single-player reward state (starter pack, daily claim, level
// rewards). Singleton + listener pattern (matches useProgress/useXp). Persists
// to localStorage `gampo_rewards`. Credits are granted by the consuming
// component via CreditContext.grantPracticeCredits; this hook only tracks what
// has been claimed and exposes claimable amounts.

import { useEffect, useState } from 'react'
import { DAILY_CLAIM_CREDITS, PROGRESS_PACK_CREDITS, STARTER_PACKS, levelRewardCredits } from '../data/rewards'
import { readJson, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_rewards'

const DEFAULT_STATE = {
    starterPackId: null,   // null = not yet chosen
    lastDailyClaim: null,  // YYYY-MM-DD
    claimedLevels: [],     // levels whose reward has been claimed
    progressPacks: 0,      // count of opt-in +1000 GC progression packs taken
}

const listeners = new Set()
let state = readState()

function dayKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10)
}

function readState() {
    const parsed = readJson(KEY, null)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE }
    return {
        ...DEFAULT_STATE,
        ...parsed,
        claimedLevels: Array.isArray(parsed.claimedLevels) ? parsed.claimedLevels : [],
        progressPacks: Number.isFinite(parsed.progressPacks) ? parsed.progressPacks : 0,
    }
}

function write() {
    writeJson(KEY, state)
}

function notify() {
    listeners.forEach(fn => fn())
}

// Choose a starter pack (one-time). Returns the credits to grant (0 for free).
export function chooseStarterPack(id) {
    if (state.starterPackId) return 0 // already chosen, ignore
    const pack = STARTER_PACKS.find(p => p.id === id)
    if (!pack) return 0
    state = { ...state, starterPackId: pack.id }
    write()
    notify()
    return pack.credits
}

export function canClaimDaily() {
    return state.lastDailyClaim !== dayKey()
}

// Claim the daily credit top-up. Returns credits granted (0 if already claimed).
export function claimDaily() {
    if (!canClaimDaily()) return 0
    state = { ...state, lastDailyClaim: dayKey() }
    write()
    notify()
    return DAILY_CLAIM_CREDITS
}

// Claim all unclaimed level rewards up to `currentLevel`. Returns total credits.
export function claimLevelRewards(currentLevel) {
    const lvl = Math.max(1, Math.floor(currentLevel))
    let total = 0
    const newlyClaimed = []
    for (let l = 2; l <= lvl; l += 1) {
        if (!state.claimedLevels.includes(l)) {
            total += levelRewardCredits(l)
            newlyClaimed.push(l)
        }
    }
    if (newlyClaimed.length) {
        state = { ...state, claimedLevels: [...state.claimedLevels, ...newlyClaimed] }
        write()
        notify()
    }
    return total
}

export function pendingLevelRewards(currentLevel) {
    const lvl = Math.max(1, Math.floor(currentLevel))
    let total = 0
    let count = 0
    for (let l = 2; l <= lvl; l += 1) {
        if (!state.claimedLevels.includes(l)) { total += levelRewardCredits(l); count += 1 }
    }
    return { total, count }
}

// Take an opt-in progression pack (+1000 GC). Repeatable; free play is never
// disturbed. Returns the credits to grant.
export function takeProgressPack() {
    state = { ...state, progressPacks: (state.progressPacks || 0) + 1 }
    write()
    notify()
    return PROGRESS_PACK_CREDITS
}

export function resetRewards() {
    state = { ...DEFAULT_STATE }
    removeKey(KEY)
    notify()
}

export function useRewards() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        starterPackId: state.starterPackId,
        starterPackChosen: Boolean(state.starterPackId),
        canClaimDaily: canClaimDaily(),
        lastDailyClaim: state.lastDailyClaim,
        claimedLevels: state.claimedLevels,
        progressPacks: state.progressPacks || 0,
        chooseStarterPack,
        claimDaily,
        claimLevelRewards,
        pendingLevelRewards,
        takeProgressPack,
        reset: resetRewards,
    }
}
