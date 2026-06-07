// useXp — single-player XP / level progression.
//
// Mirrors the useProgress / useGlobalPnl singleton + listener pattern (no
// Provider) so any consumer (XpBar, ProgressPanel, toast) shares one source of
// truth. Fed from useGameSession.record on every settled round.
//
// Storage:
//   gampo_xp_state -> { totalXp, lastDayKey, seenGames: [], levelReached }
//
// XP has no cash value and never converts to credits. It only drives cosmetic
// rank badges and a sense of momentum in the educational simulator.

import { useEffect, useState } from 'react'
import { levelForXp, rankForLevel, xpForRound } from '../data/xpLevels'
import { readJson, writeJson, removeKey } from '../utils/storage'

const XP_KEY = 'gampo_xp_state'

const DEFAULT_STATE = {
    totalXp: 0,
    lastDayKey: null,
    seenGames: [],
    levelReached: 1,
}

const listeners = new Set()
let state = readState()
let recentLevelUp = null

function dayKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 10)
}

function readState() {
    const parsed = readJson(XP_KEY, null)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE }
    return {
        ...DEFAULT_STATE,
        ...parsed,
        seenGames: Array.isArray(parsed.seenGames) ? parsed.seenGames : [],
    }
}

function writeState() {
    writeJson(XP_KEY, state)
}

function notify() {
    listeners.forEach(fn => fn())
}

// Award XP for one settled round. Returns the XP delta (handy for tests/UI).
export function recordXpRound({ gameId, profit = 0, betAmount = 0, multiplier = 0 } = {}) {
    if (!gameId) return 0
    const today = dayKey()
    const isNewGame = !state.seenGames.includes(gameId)
    const isDailyFirst = state.lastDayKey !== today
    const delta = xpForRound(
        { profit, betAmount, multiplier },
        { newGame: isNewGame, dailyFirstRound: isDailyFirst },
    )
    const beforeLevel = levelForXp(state.totalXp).level
    state = {
        ...state,
        totalXp: state.totalXp + delta,
        lastDayKey: today,
        seenGames: isNewGame ? [...state.seenGames, gameId] : state.seenGames,
    }
    const afterLevel = levelForXp(state.totalXp).level
    if (afterLevel > beforeLevel) {
        state.levelReached = afterLevel
        const rank = rankForLevel(afterLevel)
        recentLevelUp = {
            level: afterLevel,
            rank: rank.current,
            // Flag a rank-up specifically (crossed into a new tier) for the toast.
            rankUp: rankForLevel(beforeLevel).current.id !== rank.current.id,
            ts: Date.now(),
        }
    }
    writeState()
    notify()
    return delta
}

export function dismissLevelUp() {
    if (!recentLevelUp) return
    recentLevelUp = null
    notify()
}

export function resetXp() {
    state = { ...DEFAULT_STATE }
    recentLevelUp = null
    removeKey(XP_KEY)
    notify()
}

export function getXpSnapshot() {
    const resolved = levelForXp(state.totalXp)
    const rank = rankForLevel(resolved.level)
    return { totalXp: state.totalXp, ...resolved, rank }
}

export function useXp() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])

    const resolved = levelForXp(state.totalXp)
    const rank = rankForLevel(resolved.level)
    return {
        totalXp: state.totalXp,
        ...resolved,
        rank,
        recentLevelUp,
        recordXpRound,
        dismissLevelUp,
        reset: resetXp,
    }
}
