// gameOdds.js — central odds helpers + Fun Mode.
//
// Two jobs:
//   1. RTP-lock helper so games derive payouts from fair odds minus a house
//      edge (the correct pattern already used by Snakes/Slide), instead of
//      hand-tuned constants that drift player-favourable.
//   2. Fun Mode: a free-play-only toggle that boosts odds for entertainment.
//      It is NEVER a real-casino mode — when boosted, effective RTP can exceed
//      100%. It is gated to free play and clearly surfaced in the UI.
//
// Fun Mode is a module-level singleton with a listener set (same pattern as
// useProgress / useXp) so any consumer shares one source of truth without a
// Provider. Persisted to localStorage `gampo_fun_mode`.

import { clamp, round2 } from './simulationMath'
import { useEffect, useState } from 'react'

const FUN_KEY = 'gampo_fun_mode'

// How much Fun Mode tilts the math. Win probability is multiplied by
// FUN_WIN_BOOST (capped below 1.0 so a near-certain game stays valid) and
// payouts get a smaller bump. Tuned for "noticeably luckier" not "always win".
export const FUN_WIN_BOOST = 1.35
export const FUN_PAYOUT_BOOST = 1.15

const listeners = new Set()
let funMode = readFunMode()

function readFunMode() {
    try {
        return localStorage.getItem(FUN_KEY) === '1'
    } catch {
        return false
    }
}

function notify() {
    listeners.forEach(fn => fn())
}

export function isFunMode() {
    return funMode
}

export function setFunMode(value) {
    funMode = Boolean(value)
    try { localStorage.setItem(FUN_KEY, funMode ? '1' : '0') } catch { /* ignore */ }
    notify()
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
    if (!funMode) return p
    return clamp(p * FUN_WIN_BOOST, 0, 0.99)
}

// Boost a payout multiplier for Fun Mode. No-op when off.
export function funPayout(multiplier) {
    const m = Number(multiplier) || 0
    if (!funMode) return m
    return round2(m * FUN_PAYOUT_BOOST)
}

// RTP-lock: given the fair (zero-edge) payout multiplier for a win probability,
// return the payout that yields exactly `rtp` long-run return. This is the
// canonical "multiplier = fair × (1 − houseEdge)" pattern. Honors Fun Mode by
// inflating the effective RTP (so the locked payout grows) in free play.
export function rtpLockedMultiplier(winProbability, rtp) {
    const p = clamp(Number(winProbability) || 0, 0.0001, 1)
    const targetRtp = funMode ? Number(rtp) * FUN_PAYOUT_BOOST : Number(rtp)
    return round2(targetRtp / p)
}

// React hook for components that want to read/toggle Fun Mode reactively.
export function useFunMode() {
    const [on, setOn] = useState(funMode)
    useEffect(() => subscribeFunMode(() => setOn(funMode)), [])
    return [on, setFunMode]
}
