// useOnboarding — tracks whether the player has seen the first-visit welcome.
//
// Single-player, no backend: a one-time educational intro that frames GamPo as
// a math simulator (practice credits, real odds, no cashout). Persisted so it
// only shows once; resettable from Settings or via save import.
//
// Storage key: gampo_onboarding_v1 -> { seen: bool, seenAt: ISO|null }

import { useEffect, useState } from 'react'
import { readJson, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_onboarding_v1'

const DEFAULT_STATE = { seen: false, seenAt: null }

function readState() {
    const parsed = readJson(KEY, null)
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE }
    return { seen: Boolean(parsed.seen), seenAt: parsed.seenAt || null }
}

const listeners = new Set()
let state = readState()

function notify() { listeners.forEach(fn => fn()) }

export function completeOnboarding() {
    state = { seen: true, seenAt: new Date().toISOString() }
    writeJson(KEY, state)
    notify()
}

export function resetOnboarding() {
    state = { ...DEFAULT_STATE }
    removeKey(KEY)
    notify()
}

export function hasSeenOnboarding() {
    return state.seen
}

export function useOnboarding() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        seen: state.seen,
        seenAt: state.seenAt,
        completeOnboarding,
        resetOnboarding,
    }
}
