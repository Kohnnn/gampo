// useSidebarPins — Wave 23 sidebar pinning persisted to localStorage.
//
// Each pin entry references a `gameItems` row by `path` (the same value used
// by the Sidebar links). Pins are surfaced under a new "Pinned" group above
// Featured. A small star/pin button on every game row toggles membership.
//
// Storage key: `gampo_pinned_games` -> string[] of paths in pin order.
//
// Listener pattern matches `useGlobalPnl` / `useProgress`: state lives at
// module scope so multiple consumers (Sidebar header + each row) re-render
// in sync without prop drilling.

import { useEffect, useState } from 'react'
import { readRaw, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_pinned_games'
const MAX_PINS = 12

const listeners = new Set()
const initial = read()
let pins = initial.pins
// A persisted value that needed repairing (malformed JSON, wrong type,
// duplicates, over MAX_PINS) is written back so storage matches what the UI
// renders. This is a plain rewrite of the same key, not a migration.
if (initial.changed) writeJson(KEY, pins)

function read() {
    // Distinguish "absent" (legitimately empty) from "present but unusable".
    // readJson collapses both to the fallback, which would leave corrupt bytes
    // in storage while the UI renders an empty list.
    const rawString = readRaw(KEY, null)
    let parsed
    let usable = true
    if (rawString == null) {
        parsed = []
    } else {
        try { parsed = JSON.parse(rawString) } catch { parsed = null }
        if (!Array.isArray(parsed)) { parsed = []; usable = false }
    }
    // Normalize: drop non-strings and duplicates, then keep the most recent
    // MAX_PINS in stored order, matching the FIFO the toggle path enforces.
    const seen = new Set()
    const distinct = []
    for (const p of parsed) {
        if (typeof p !== 'string' || seen.has(p)) continue
        seen.add(p)
        distinct.push(p)
    }
    const pins = distinct.slice(-MAX_PINS)
    const changed = !usable || pins.length !== parsed.length || pins.some((p, i) => p !== parsed[i])
    return { pins, changed }
}


function notify() {
    listeners.forEach(fn => fn())
}

export function togglePin(path) {
    if (!path) return
    const next = pins.includes(path)
        ? pins.filter(p => p !== path)
        : (pins.length >= MAX_PINS ? [...pins.slice(1), path] : [...pins, path])
    // Commit only if the write actually persisted. Mutating the module state
    // before a failed write would leave the UI showing a pin that storage does
    // not have — a phantom pin that survives until the next reload.
    if (!writeJson(KEY, next)) return
    pins = next
    notify()
}

export function isPinned(path) {
    return pins.includes(path)
}

export function clearPins() {
    pins = []
    removeKey(KEY)
    notify()
}

export function useSidebarPins() {
    const [, force] = useState(0)
    useEffect(() => {
        const fn = () => force(n => n + 1)
        listeners.add(fn)
        return () => { listeners.delete(fn) }
    }, [])
    return {
        pins,
        isPinned,
        togglePin,
        clearPins,
        max: MAX_PINS,
    }
}
