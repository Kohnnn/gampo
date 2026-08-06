// gameOdds.js — central odds helpers + Fun Mode.
//
// Two jobs:
//   1. RTP-lock helper so games derive payouts from fair odds minus a house
//      edge (the correct pattern already used by Snakes/Slide), instead of
//      hand-tuned constants that drift player-favourable.
//   2. Fun Mode: a free-play-only toggle that boosts odds for entertainment.
//      It is NEVER a real-casino mode — boosted RTP is capped at 100% and is
//      gated to free play and clearly surfaced in the UI.
//
// Fun Mode is a module-level singleton with a listener set (same pattern as
// useProgress / useXp) so any consumer shares one source of truth without a
// Provider. Persisted to localStorage `gampo_fun_mode`.

import { clamp, round2 } from './simulationMath'
import { useEffect, useState } from 'react'

const FUN_KEY = 'gampo_fun_mode'
export const FUN_MODE_STATES = ['fun', 'story', 'serious']

// How much Fun Mode tilts the math. Win probability is multiplied by
// FUN_WIN_BOOST (capped below 1.0 so a near-certain game stays valid) and
// payouts get a smaller bump. Tuned for "noticeably luckier" not "always win".
// The payout boost is deliberately small and the effective RTP is capped at
// FUN_MAX_RTP so Fun Mode never turns into a runaway money printer — it nudges
// odds toward break-even, it does not guarantee profit.
export const FUN_WIN_BOOST = 1.25
export const FUN_PAYOUT_BOOST = 1.06
export const FUN_MAX_RTP = 1.0

const listeners = new Set()
let funModeState = readFunModeState()

function readFunModeState() {
    try {
        const value = localStorage.getItem(FUN_KEY)
        if (FUN_MODE_STATES.includes(value)) return value
        if (value === '0') return 'serious'
        return 'fun'
    } catch {
        return 'fun'
    }
}

function notify() {
    listeners.forEach(fn => fn())
}

export function isFunMode() {
    return funModeState === 'fun'
}

export function setFunMode(value) {
    funModeState = value === false ? 'serious' : value === true ? 'fun' : (FUN_MODE_STATES.includes(value) ? value : 'fun')
    try { localStorage.setItem(FUN_KEY, funModeState) } catch { /* ignore */ }
    notify()
}

export function getFunModeState() {
    return funModeState
}

export function subscribeFunMode(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
}

// Boost a win probability for Fun Mode. No-op when Fun Mode is off. Clamped to
// keep it a valid probability and to leave a sliver of losing chance so wins
// still feel earned.
export function funWinChance(probability) {
    const p = clamp(Number(probability) || 0, 0, 1)
    if (!isFunMode()) return p
    return clamp(p * FUN_WIN_BOOST, 0, 0.99)
}

// Boost a payout multiplier for Fun Mode. No-op when off.
export function funPayout(multiplier) {
    const m = Number(multiplier) || 0
    if (!isFunMode()) return m
    return round2(m * FUN_PAYOUT_BOOST)
}

export function funBoostedRtp(rtp) {
    const base = Number(rtp) || 0
    if (!isFunMode()) return base
    return Math.min(FUN_MAX_RTP, base * FUN_PAYOUT_BOOST)
}

export function funBoostFactor(baseRtp) {
    const base = Number(baseRtp) || 0
    if (base <= 0) return 1
    return funBoostedRtp(base) / base
}

// RTP-lock: given the fair (zero-edge) payout multiplier for a win probability,
// return the payout that yields exactly `rtp` long-run return. This is the
// canonical "multiplier = fair × (1 − houseEdge)" pattern. Honors Fun Mode by
// inflating the effective RTP (so the locked payout grows) in free play.
export function rtpLockedMultiplier(winProbability, rtp) {
    const p = clamp(Number(winProbability) || 0, 0.0001, 1)
    const targetRtp = funBoostedRtp(rtp)
    return round2(targetRtp / p)
}

// React hook for components that want to read/toggle Fun Mode reactively.
export function useFunMode() {
    const [state, setState] = useState(funModeState)
    useEffect(() => subscribeFunMode(() => setState(funModeState)), [])
    return [state === 'fun', setFunMode, state]
}
