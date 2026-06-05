// useMissions — Wave 25 mission/VIP progression layered on top of useProgress.
//
// The hook tracks per-period rolling counters (daily / weekly) plus a
// persistent lifetime mirror so missions surface immediately. Daily +
// weekly counters reset when the date / iso-week changes (lazy on next
// recordRound or hook subscription).
//
// Storage:
//   gampo_missions_period_state  -> { dayKey, weekKey, daily {...}, weekly {...}, lifetime {...} }
//   gampo_missions_completed     -> { [missionId]: { ts, claimed } }
//
// API:
//   const m = useMissions()
//   m.stats           -> { daily, weekly, lifetime }
//   m.missions        -> evaluated list with ratio + complete + claimed
//   m.summary         -> { daily, weekly, lifetime } counts
//   m.recentComplete  -> { mission } | null (for toast)
//   m.claim(id)       -> mark as claimed; awards reward.credits via CreditContext-side caller
//   m.dismiss()       -> clear the toast
//   m.reset()         -> wipe period state + completed map
//
// `recordMissionRound` is invoked by useGameSession (Wave 19 already fires
// `recordProgressRound`; this hook subscribes to the same path through a
// thin re-export below).

import { useEffect, useState } from 'react'
import { MISSIONS, evaluateMissions } from '../data/missions'

const STATE_KEY = 'gampo_missions_period_state'
const COMPLETED_KEY = 'gampo_missions_completed'

const DEFAULT_PERIOD = {
    rounds: 0,
    wins: 0,
    wagered: 0,
    bestMultiplier: 0,
    bestStreak: 0,
    currentStreak: 0,
    netProfit: 0,
    bestSingleWin: 0,
    uniqueGames: [],
}

function dayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function weekKey(d = new Date()) {
    // ISO week — copy + truncate to Monday.
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    const day = date.getUTCDay() || 7
    date.setUTCDate(date.getUTCDate() + 4 - day)
    const year = date.getUTCFullYear()
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
    return `${year}-W${String(week).padStart(2, '0')}`
}

const listeners = new Set()
let state = readState()
let completed = readCompleted()
let recentComplete = null

function readState() {
    try {
        const raw = localStorage.getItem(STATE_KEY)
        if (!raw) return defaultState()
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return defaultState()
        return {
            dayKey: parsed.dayKey || dayKey(),
            weekKey: parsed.weekKey || weekKey(),
            daily: { ...DEFAULT_PERIOD, ...(parsed.daily || {}), uniqueGames: Array.isArray(parsed.daily?.uniqueGames) ? parsed.daily.uniqueGames : [] },
            weekly: { ...DEFAULT_PERIOD, ...(parsed.weekly || {}), uniqueGames: Array.isArray(parsed.weekly?.uniqueGames) ? parsed.weekly.uniqueGames : [] },
            lifetime: { ...DEFAULT_PERIOD, ...(parsed.lifetime || {}), uniqueGames: Array.isArray(parsed.lifetime?.uniqueGames) ? parsed.lifetime.uniqueGames : [] },
        }
    } catch {
        return defaultState()
    }
}

function defaultState() {
    return {
        dayKey: dayKey(),
        weekKey: weekKey(),
        daily: { ...DEFAULT_PERIOD, uniqueGames: [] },
        weekly: { ...DEFAULT_PERIOD, uniqueGames: [] },
        lifetime: { ...DEFAULT_PERIOD, uniqueGames: [] },
    }
}

function readCompleted() {
    try {
        const raw = localStorage.getItem(COMPLETED_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function writeState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)) } catch { /* ignore */ }
}

function writeCompleted() {
    try { localStorage.setItem(COMPLETED_KEY, JSON.stringify(completed)) } catch { /* ignore */ }
}

function notify() {
    listeners.forEach(fn => fn())
}

function rollPeriods(now = new Date()) {
    const dk = dayKey(now)
    const wk = weekKey(now)
    let dirty = false
    if (state.dayKey !== dk) {
        state = { ...state, dayKey: dk, daily: { ...DEFAULT_PERIOD, uniqueGames: [] } }
        dirty = true
    }
    if (state.weekKey !== wk) {
        state = { ...state, weekKey: wk, weekly: { ...DEFAULT_PERIOD, uniqueGames: [] } }
        dirty = true
    }
    if (dirty) writeState()
}

function bumpPeriod(period, gameId, profit, betAmount, multiplier) {
    const won = profit > 0
    const next = {
        ...period,
        rounds: period.rounds + 1,
        wins: period.wins + (won ? 1 : 0),
        wagered: period.wagered + (Number(betAmount) || 0),
        bestMultiplier: Math.max(period.bestMultiplier, Number(multiplier) || 0),
        currentStreak: won ? period.currentStreak + 1 : 0,
        bestStreak: Math.max(period.bestStreak, won ? period.currentStreak + 1 : 0),
        netProfit: (period.netProfit || 0) + (Number(profit) || 0),
        bestSingleWin: Math.max(period.bestSingleWin || 0, won ? profit : 0),
        uniqueGames: period.uniqueGames.includes(gameId)
            ? period.uniqueGames
            : [...period.uniqueGames, gameId],
    }
    return next
}

function checkCompletes(stats) {
    const evaluated = evaluateMissions(stats)
    let newest = null
    for (const m of evaluated) {
        if (m.complete && !completed[m.id]) {
            completed[m.id] = { ts: Date.now(), claimed: false }
            newest = m
        }
    }
    if (newest) {
        recentComplete = newest
        writeCompleted()
    }
}

export function recordMissionRound({ gameId, profit = 0, betAmount = 0, multiplier = 0 } = {}) {
    if (!gameId) return
    rollPeriods()
    state = {
        ...state,
        daily: bumpPeriod(state.daily, gameId, profit, betAmount, multiplier),
        weekly: bumpPeriod(state.weekly, gameId, profit, betAmount, multiplier),
        lifetime: bumpPeriod(state.lifetime, gameId, profit, betAmount, multiplier),
    }
    writeState()
    checkCompletes(state)
    notify()
}

export function claimMission(id) {
    const entry = completed[id]
    if (!entry || entry.claimed) return null
    completed = { ...completed, [id]: { ...entry, claimed: true, claimedAt: Date.now() } }
    writeCompleted()
    notify()
    const mission = evaluateMissions(state).find(m => m.id === id)
    return mission ? { ...mission, reward: mission.reward } : null
}

export function dismissMissionToast() {
    if (!recentComplete) return
    recentComplete = null
    notify()
}

export function resetMissions() {
    state = defaultState()
    completed = {}
    recentComplete = null
    try {
        localStorage.removeItem(STATE_KEY)
        localStorage.removeItem(COMPLETED_KEY)
    } catch { /* ignore */ }
    notify()
}

export function resetVipProgress() {
    state = {
        ...state,
        lifetime: { ...DEFAULT_PERIOD, uniqueGames: [] },
    }
    const lifetimeIds = new Set(MISSIONS.filter(m => m.period === 'lifetime').map(m => m.id))
    completed = Object.fromEntries(
        Object.entries(completed).filter(([id]) => !lifetimeIds.has(id)),
    )
    recentComplete = recentComplete && lifetimeIds.has(recentComplete.id) ? null : recentComplete
    writeState()
    writeCompleted()
    notify()
}

export function useMissions() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])

    rollPeriods()
    const evaluated = evaluateMissions(state)
    const summary = {
        daily: { complete: 0, total: 0, claimed: 0 },
        weekly: { complete: 0, total: 0, claimed: 0 },
        lifetime: { complete: 0, total: 0, claimed: 0 },
    }
    for (const m of evaluated) {
        const bucket = summary[m.period]
        if (!bucket) continue
        bucket.total += 1
        if (m.complete) bucket.complete += 1
        if (completed[m.id]?.claimed) bucket.claimed += 1
    }

    const missions = evaluated.map(m => ({
        ...m,
        completedAt: completed[m.id]?.ts || null,
        claimed: !!completed[m.id]?.claimed,
        claimable: m.complete && !completed[m.id]?.claimed,
    }))

    return {
        stats: state,
        missions,
        summary,
        recentComplete,
        claim: claimMission,
        dismiss: dismissMissionToast,
        reset: resetMissions,
        resetVip: resetVipProgress,
    }
}
