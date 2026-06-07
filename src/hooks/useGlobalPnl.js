// useGlobalPnl — aggregates session profit/loss across three scopes.
//
// Scopes:
//   session  — profit accumulated during this browser tab life
//   game     — profit on the most-recently-visited game route
//   alltime  — profit persisted to localStorage across reloads
//
// Each game session calls `recordPnl({ gameId, profit, betAmount })` after
// every settled round. The hook exposes:
//   - profitByScope:   { session: number, game: number, alltime: number }
//   - winsByScope:     { session: { wins, losses }, ... }
//   - historyByScope:  { session: [{ts, profit, gameId}], ... }
//   - currentGameId:   most-recent gameId that recorded a round
//   - reset(scope)     — clear a single scope
//
// State lives at module scope so any consumer (StatsPanel, ChatDock, dev
// pages) sees the same numbers without a Provider tree.

import { useEffect, useState } from 'react'
import { readJson, writeJson, removeKey } from '../utils/storage'

const ALLTIME_KEY = 'gampo_pnl_alltime'
const ALLTIME_LIMIT = 500

const listeners = new Set()
let sessionHistory = []
let alltimeHistory = readAlltime()
let currentGameId = null

function readAlltime() {
    const parsed = readJson(ALLTIME_KEY, [])
    return Array.isArray(parsed) ? parsed : []
}

function writeAlltime() {
    const trimmed = alltimeHistory.slice(-ALLTIME_LIMIT)
    if (writeJson(ALLTIME_KEY, trimmed)) {
        alltimeHistory = trimmed
    }
}

function notify() {
    listeners.forEach(fn => fn())
}

export function recordPnl({ gameId, profit = 0, betAmount = 0, label = '' }) {
    const entry = {
        ts: Date.now(),
        gameId: gameId || 'unknown',
        profit: Number(profit) || 0,
        betAmount: Number(betAmount) || 0,
        label,
    }
    sessionHistory.push(entry)
    alltimeHistory.push(entry)
    if (sessionHistory.length > 1000) sessionHistory = sessionHistory.slice(-1000)
    currentGameId = entry.gameId
    writeAlltime()
    notify()
}

export function resetScope(scope) {
    if (scope === 'session') sessionHistory = []
    else if (scope === 'alltime') {
        alltimeHistory = []
        removeKey(ALLTIME_KEY)
    } else if (scope === 'game' && currentGameId) {
        sessionHistory = sessionHistory.filter(e => e.gameId !== currentGameId)
    }
    notify()
}

function summarise(entries) {
    let profit = 0
    let wagered = 0
    let wins = 0
    let losses = 0
    for (const e of entries) {
        profit += e.profit
        wagered += e.betAmount
        if (e.profit > 0) wins += 1
        else if (e.profit < 0) losses += 1
    }
    return { profit, wagered, wins, losses, count: entries.length }
}

export function useGlobalPnl() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => listeners.delete(fn)
    }, [])

    const session = summarise(sessionHistory)
    const gameEntries = currentGameId ? sessionHistory.filter(e => e.gameId === currentGameId) : []
    const game = summarise(gameEntries)
    const alltime = summarise(alltimeHistory)

    return {
        currentGameId,
        summary: { session, game, alltime },
        history: { session: sessionHistory, game: gameEntries, alltime: alltimeHistory },
        reset: resetScope,
    }
}
