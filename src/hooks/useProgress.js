// useProgress — drives the Wave 19 progression system.
//
// Tracks per-game stats from every settled round and computes which
// achievements have unlocked. Persisted to localStorage and resettable.
//
// Storage keys:
//   gampo_progress_stats        -> { totalRounds, totalWins, totalLosses,
//                                     totalWagered, totalProfit,
//                                     bestMultiplier, bestWinStreak,
//                                     currentWinStreak, lastGameId,
//                                     uniqueGames: [], casesTotalDrops,
//                                     casesRareDrops }
//   gampo_progress_unlocked     -> { [achievementId]: timestamp }
//
// API:
//   const progress = useProgress()
//   progress.stats               -> live stats snapshot
//   progress.unlocked            -> { [id]: ts } map of unlocked achievements
//   progress.achievements        -> evaluated list (ratio, complete, value)
//   progress.summary             -> { unlockedCount, total, percent, recent }
//   progress.recentUnlock        -> { id, name, ... } | null (auto-clears)
//   progress.dismissUnlock()     -> clear the toast
//   progress.recordRound(round)  -> mark a settled round + bump stats
//   progress.recordCaseDrop(p)   -> count a case drop (rare flagged separately)
//   progress.reset()             -> clear stats + unlocked
//
// Listener pattern matches useGlobalPnl so any consumer (ProgressPanel,
// achievement toast, ChatDock) sees the same numbers without a Provider.

import { useEffect, useState } from 'react'
import { ACHIEVEMENTS, evaluateAchievements } from '../data/achievements'

const STATS_KEY = 'gampo_progress_stats'
const UNLOCK_KEY = 'gampo_progress_unlocked'
const RARE_RARITIES = new Set(['Restricted', 'Classified', 'Covert', 'Remarkable', 'Exotic', 'Extraordinary', 'Contraband', '★'])

const DEFAULT_STATS = {
    totalRounds: 0,
    totalWins: 0,
    totalLosses: 0,
    totalPushes: 0,
    totalWagered: 0,
    totalProfit: 0,
    bestMultiplier: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
    bestLossStreak: 0,
    currentLossStreak: 0,
    bestProfit: 0,
    biggestSingleWin: 0,
    lastGameId: null,
    uniqueGames: [],
    casesTotalDrops: 0,
    casesRareDrops: 0,
    // Slot-feature engagement: bumped via recordFeatureEvent.
    bonusRoundsTriggered: 0,
    freeSpinsAwarded: 0,
}

const listeners = new Set()
let stats = readStats()
let unlocked = readUnlocked()
let recentUnlock = null

function readStats() {
    try {
        const raw = localStorage.getItem(STATS_KEY)
        if (!raw) return { ...DEFAULT_STATS }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATS }
        return {
            ...DEFAULT_STATS,
            ...parsed,
            uniqueGames: Array.isArray(parsed.uniqueGames) ? parsed.uniqueGames : [],
        }
    } catch {
        return { ...DEFAULT_STATS }
    }
}

function readUnlocked() {
    try {
        const raw = localStorage.getItem(UNLOCK_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function writeStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch { /* ignore */ }
}

function writeUnlocked() {
    try { localStorage.setItem(UNLOCK_KEY, JSON.stringify(unlocked)) } catch { /* ignore */ }
}

function notify() {
    listeners.forEach(fn => fn())
}

function checkUnlocks() {
    const evaluated = evaluateAchievements(stats)
    let newest = null
    for (const ach of evaluated) {
        if (ach.complete && !unlocked[ach.id]) {
            unlocked[ach.id] = Date.now()
            newest = ach
        }
    }
    if (newest) {
        recentUnlock = newest
        writeUnlocked()
    }
}

export function recordRound({ gameId, profit = 0, betAmount = 0, multiplier = 0 } = {}) {
    if (!gameId) return
    const won = profit > 0
    const lost = profit < 0
    const nextWinStreak = won ? stats.currentWinStreak + 1 : 0
    const nextLossStreak = lost ? stats.currentLossStreak + 1 : 0
    const nextProfit = stats.totalProfit + (Number(profit) || 0)
    stats = {
        ...stats,
        totalRounds: stats.totalRounds + 1,
        totalWins: stats.totalWins + (won ? 1 : 0),
        totalLosses: stats.totalLosses + (lost ? 1 : 0),
        totalPushes: stats.totalPushes + (!won && !lost ? 1 : 0),
        totalWagered: stats.totalWagered + (Number(betAmount) || 0),
        totalProfit: nextProfit,
        bestProfit: Math.max(stats.bestProfit, nextProfit),
        biggestSingleWin: Math.max(stats.biggestSingleWin, won ? profit : 0),
        bestMultiplier: Math.max(stats.bestMultiplier, Number(multiplier) || 0),
        currentWinStreak: nextWinStreak,
        bestWinStreak: Math.max(stats.bestWinStreak, nextWinStreak),
        currentLossStreak: nextLossStreak,
        bestLossStreak: Math.max(stats.bestLossStreak, nextLossStreak),
        lastGameId: gameId,
        uniqueGames: stats.uniqueGames.includes(gameId)
            ? stats.uniqueGames
            : [...stats.uniqueGames, gameId],
    }
    writeStats()
    checkUnlocks()
    notify()
}

// Slot/feature engagement counter. Games call this when a bonus feature
// triggers (free spins, hold & respin, wheel, etc.) so feature-focused
// achievements can unlock independently of raw round counts.
export function recordFeatureEvent({ type = 'bonus', freeSpins = 0 } = {}) {
    stats = {
        ...stats,
        bonusRoundsTriggered: stats.bonusRoundsTriggered + 1,
        freeSpinsAwarded: stats.freeSpinsAwarded + (Number(freeSpins) || 0),
    }
    writeStats()
    checkUnlocks()
    notify()
}

export function recordCaseDrop(pick = {}) {
    const isRare = RARE_RARITIES.has(pick.rarity)
    stats = {
        ...stats,
        casesTotalDrops: stats.casesTotalDrops + 1,
        casesRareDrops: stats.casesRareDrops + (isRare ? 1 : 0),
    }
    writeStats()
    checkUnlocks()
    notify()
}

export function dismissUnlock() {
    if (!recentUnlock) return
    recentUnlock = null
    notify()
}

export function resetProgress() {
    stats = { ...DEFAULT_STATS }
    unlocked = {}
    recentUnlock = null
    try {
        localStorage.removeItem(STATS_KEY)
        localStorage.removeItem(UNLOCK_KEY)
    } catch { /* ignore */ }
    notify()
}

export function useProgress() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])

    const achievements = evaluateAchievements(stats)
    const unlockedCount = achievements.filter(a => a.complete).length
    const total = ACHIEVEMENTS.length
    const percent = total ? Math.round((unlockedCount / total) * 100) : 0
    const recent = Object.entries(unlocked)
        .map(([id, ts]) => {
            const meta = achievements.find(a => a.id === id)
            return meta ? { ...meta, ts } : null
        })
        .filter(Boolean)
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 6)

    return {
        stats,
        unlocked,
        achievements,
        summary: { unlockedCount, total, percent, recent },
        recentUnlock,
        recordRound,
        recordCaseDrop,
        dismissUnlock,
        reset: resetProgress,
    }
}
