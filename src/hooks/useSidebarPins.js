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
import { readJson, writeJson, removeKey } from '../utils/storage'

const KEY = 'gampo_pinned_games'
const MAX_PINS = 12

const listeners = new Set()
let pins = read()

function read() {
    const parsed = readJson(KEY, [])
    return Array.isArray(parsed) ? parsed.filter(p => typeof p === 'string') : []
}

function write() {
    writeJson(KEY, pins)
}

function notify() {
    listeners.forEach(fn => fn())
}

export function togglePin(path) {
    if (!path) return
    if (pins.includes(path)) {
        pins = pins.filter(p => p !== path)
    } else {
        if (pins.length >= MAX_PINS) {
            pins = [...pins.slice(1), path]
        } else {
            pins = [...pins, path]
        }
    }
    write()
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
