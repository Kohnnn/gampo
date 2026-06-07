// useSessionGuard — opt-in responsible-play guardrails (educational).
//
// A real-casino-grade safety tool turned into a teaching aid: the player can
// set a loss limit, a wager (budget) limit, a round-count limit, and/or a
// time limit for the current play session. The guard tracks live session
// totals (fed from useGameSession.record) and emits a status:
//   ok        — within all limits
//   warn      — within 80% of a limit, or a tilt pattern detected
//   exceeded  — a limit has been crossed
//
// "Tilt" detection: a rising-bet-after-loss streak (chasing). This is purely
// informational — nothing is blocked; the app only surfaces a nudge, matching
// the educational, no-real-money framing.
//
// Limits live in localStorage (gampo_session_guard_v1); live session counters
// are in-memory (reset each tab / via resetSessionGuard) so they reflect the
// current sitting, not all-time.

import { useEffect, useState } from 'react'
import { readJson, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_session_guard_v1'

const DEFAULT_LIMITS = {
    enabled: false,
    lossLimit: 0,   // stop-nudge when net loss reaches this (credits)
    wagerLimit: 0,  // total wagered this session
    roundLimit: 0,  // number of rounds this session
    minutesLimit: 0, // wall-clock minutes since session start
}

function readLimits() {
    const parsed = readJson(KEY, null)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_LIMITS }
    return {
        enabled: Boolean(parsed.enabled),
        lossLimit: Math.max(0, Number(parsed.lossLimit) || 0),
        wagerLimit: Math.max(0, Number(parsed.wagerLimit) || 0),
        roundLimit: Math.max(0, Number(parsed.roundLimit) || 0),
        minutesLimit: Math.max(0, Number(parsed.minutesLimit) || 0),
    }
}

const listeners = new Set()
let limits = readLimits()
let session = { rounds: 0, wagered: 0, profit: 0, betUps: 0, startedAt: Date.now() }

function notify() { listeners.forEach(fn => fn()) }

export function setSessionLimits(next) {
    limits = { ...limits, ...next }
    // normalise
    limits.enabled = Boolean(limits.enabled)
    for (const k of ['lossLimit', 'wagerLimit', 'roundLimit', 'minutesLimit']) {
        limits[k] = Math.max(0, Number(limits[k]) || 0)
    }
    writeJson(KEY, limits)
    notify()
}

export function clearSessionLimits() {
    limits = { ...DEFAULT_LIMITS }
    removeKey(KEY)
    notify()
}

// Fed from useGameSession.record on each settled round.
export function recordGuardRound({ profit = 0, betAmount = 0 } = {}) {
    const p = Number(profit) || 0
    const bet = Number(betAmount) || 0
    // tilt: bet increased vs previous bet AND previous round was a loss
    if (session._lastBet != null && bet > session._lastBet && session._lastProfit < 0) {
        session.betUps += 1
    } else if (p >= 0) {
        session.betUps = 0
    }
    session = {
        ...session,
        rounds: session.rounds + 1,
        wagered: session.wagered + bet,
        profit: session.profit + p,
        _lastBet: bet,
        _lastProfit: p,
    }
    notify()
}

export function resetSessionGuard() {
    session = { rounds: 0, wagered: 0, profit: 0, betUps: 0, startedAt: Date.now() }
    notify()
}

const TILT_THRESHOLD = 3

export function evaluateGuard(now = Date.now()) {
    const reasons = []
    let level = 'ok'
    const bump = (next) => {
        if (next === 'exceeded') level = 'exceeded'
        else if (next === 'warn' && level !== 'exceeded') level = 'warn'
    }

    if (limits.enabled) {
        const netLoss = Math.max(0, -session.profit)
        const checks = [
            { on: limits.lossLimit, val: netLoss, label: 'loss limit', fmt: v => `${Math.round(v)} GC lost` },
            { on: limits.wagerLimit, val: session.wagered, label: 'wager budget', fmt: v => `${Math.round(v)} GC wagered` },
            { on: limits.roundLimit, val: session.rounds, label: 'round limit', fmt: v => `${v} rounds` },
            { on: limits.minutesLimit, val: (now - session.startedAt) / 60000, label: 'time limit', fmt: v => `${Math.floor(v)} min` },
        ]
        for (const c of checks) {
            if (c.on > 0) {
                if (c.val >= c.on) { bump('exceeded'); reasons.push(`${c.label} reached (${c.fmt(c.val)})`) }
                else if (c.val >= c.on * 0.8) { bump('warn'); reasons.push(`approaching ${c.label}`) }
            }
        }
    }

    // Tilt detection runs regardless of limits (informational).
    const tilt = session.betUps >= TILT_THRESHOLD
    if (tilt) { bump('warn'); reasons.push('rising bets after losses (chasing)') }

    return {
        level,
        reasons,
        tilt,
        session: { ...session },
        elapsedMinutes: Math.floor((now - session.startedAt) / 60000),
    }
}

export function useSessionGuard() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        limits,
        status: evaluateGuard(),
        setSessionLimits,
        clearSessionLimits,
        resetSessionGuard,
    }
}
