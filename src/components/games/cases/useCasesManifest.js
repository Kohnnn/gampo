import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeCaseForRuntime, rarityDropWeight } from './caseEconomy'

const UNAVAILABLE = 'Cases are unavailable. Try again.'
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasName = value => typeof value === 'string' && value.trim().length > 0

function normalizeManifest(data) {
    if (!Array.isArray(data) || !data.length) throw new Error(UNAVAILABLE)
    const ids = new Set()
    for (const entry of data) {
        if (!isRecord(entry) || !hasName(entry.id) || !hasName(entry.name) || ids.has(entry.id)
            || (entry.type != null && typeof entry.type !== 'string')
            || !Array.isArray(entry.items) || !entry.items.length) throw new Error(UNAVAILABLE)
        ids.add(entry.id)
        for (const item of entry.items) {
            if (!isRecord(item) || !hasName(item.id) || !hasName(item.name)
                || (item.rarity !== null && typeof item.rarity === 'object')) throw new Error(UNAVAILABLE)
        }
    }
    return data.map(entry => {
        const normalized = normalizeCaseForRuntime(entry)
        if (!Number.isFinite(normalized.openPriceGc) || normalized.openPriceGc <= 0
            || normalized.items.some(item => !Number.isFinite(item.valueGc) || item.valueGc < 0
                || !Number.isFinite(rarityDropWeight(item)) || rarityDropWeight(item) <= 0)) throw new Error(UNAVAILABLE)
        return normalized
    })
}

export function useCasesManifest() {
    const [state, setState] = useState({ cases: null, status: 'loading', error: null })
    const mounted = useRef(false)
    const generation = useRef(0)
    const pending = useRef(false)
    const retry = useCallback(() => {
        if (!mounted.current || pending.current) return
        pending.current = true
        const attempt = ++generation.current
        const current = () => mounted.current && generation.current === attempt
        setState({ cases: null, status: 'loading', error: null })
        const load = async () => {
            try {
                const response = await fetch('/data/cs-cases.json')
                if (!response.ok) throw new Error(UNAVAILABLE)
                const cases = normalizeManifest(await response.json())
                if (current()) setState({ cases, status: 'ready', error: null })
            } catch {
                if (current()) setState({ cases: null, status: 'error', error: UNAVAILABLE })
            } finally {
                if (current()) pending.current = false
            }
        }
        load()
    }, [])

    useEffect(() => {
        mounted.current = true
        retry()
        return () => {
            mounted.current = false
            generation.current++
            pending.current = false
        }
    }, [retry])

    return { ...state, retry }
}
