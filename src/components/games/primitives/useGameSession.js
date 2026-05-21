// Per-game session state stored in localStorage. History (last 200 results)
// + derived live stats (totals, win rate, biggest hit, RTP, streaks).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { recordPnl } from '../../../hooks/useGlobalPnl'

const HISTORY_LIMIT = 200

function readArr(key) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
}

function writeArr(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch { /* ignore */ }
}

export default function useGameSession(gameId) {
    const key = `gampo_history_${gameId}`
    const [history, setHistory] = useState(() => readArr(key))

    const record = useCallback((entry) => {
        // entry: { id, label, profit, betAmount, multiplier?, meta? }
        setHistory(prev => {
            const next = [{ ...entry, ts: Date.now() }, ...prev].slice(0, HISTORY_LIMIT)
            writeArr(key, next)
            return next
        })
        // Mirror to the global PnL aggregator so StatsPanel can show
        // session/game/all-time profit without each game re-implementing it.
        try {
            recordPnl({
                gameId,
                profit: entry.profit,
                betAmount: entry.betAmount,
                label: entry.label,
            })
        } catch { /* ignore */ }
    }, [key, gameId])

    const clear = useCallback(() => {
        writeArr(key, [])
        setHistory([])
    }, [key])

    const stats = useMemo(() => {
        if (!history.length) {
            return {
                count: 0, wins: 0, losses: 0, pushes: 0,
                wagered: 0, returned: 0, profit: 0, rtp: null,
                biggestWin: 0, biggestLoss: 0,
                streakWin: 0, streakLoss: 0, currentStreak: 0,
                lastResults: [],
            }
        }
        let wins = 0, losses = 0, pushes = 0
        let wagered = 0, returned = 0
        let biggestWin = 0, biggestLoss = 0
        let curStreak = 0, lastDirection = null
        let bestWinStreak = 0, bestLossStreak = 0
        const oldestFirst = [...history].reverse()
        for (const item of oldestFirst) {
            const bet = Math.max(0, Number(item.betAmount) || 0)
            const profit = Number(item.profit) || 0
            wagered += bet
            returned += bet + profit
            if (profit > 0) {
                wins++
                if (profit > biggestWin) biggestWin = profit
            } else if (profit < 0) {
                losses++
                if (profit < biggestLoss) biggestLoss = profit
            } else {
                pushes++
            }
            const dir = profit > 0 ? 'W' : profit < 0 ? 'L' : 'P'
            if (dir === lastDirection) {
                curStreak += 1
            } else {
                curStreak = 1
                lastDirection = dir
            }
            if (dir === 'W' && curStreak > bestWinStreak) bestWinStreak = curStreak
            if (dir === 'L' && curStreak > bestLossStreak) bestLossStreak = curStreak
        }
        return {
            count: history.length,
            wins, losses, pushes,
            wagered, returned,
            profit: returned - wagered,
            rtp: wagered > 0 ? returned / wagered : null,
            biggestWin,
            biggestLoss,
            streakWin: bestWinStreak,
            streakLoss: bestLossStreak,
            currentStreak: { dir: lastDirection, length: curStreak },
            lastResults: history.slice(0, 24),
        }
    }, [history])

    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === key) setHistory(readArr(key))
        }
        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [key])

    return { history, stats, record, clear }
}
