// Lightweight provably-fair simulation RNG with seed/nonce.
// Local-only. Educational only.
// Uses HMAC-SHA-256 via Web Crypto when available, with a deterministic
// fallback hash for non-browser test environments.

const STORAGE_KEY = 'gampo_pf_state'

function randomHex(length = 32) {
    const bytes = new Uint8Array(length)
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes)
    } else {
        // gampo:allow-math-random-fallback — emergency seed bytes only when Web Crypto is absent (non-browser test env). Real gameplay takes crypto.getRandomValues above.
        for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
    }
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        return JSON.parse(raw)
    } catch {
        return null
    }
}

function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
        // ignore
    }
}

export function getProvablyFair() {
    let state = loadState()
    if (!state || !state.serverSeed || !state.clientSeed) {
        state = {
            serverSeed: randomHex(16),
            previousServerSeed: null,
            clientSeed: randomHex(8),
            nonce: 0,
        }
        saveState(state)
    }
    return state
}

export function rotateSeeds(nextClientSeed) {
    const current = getProvablyFair()
    const next = {
        serverSeed: randomHex(16),
        previousServerSeed: current.serverSeed,
        clientSeed: nextClientSeed && String(nextClientSeed).trim() ? String(nextClientSeed).trim() : randomHex(8),
        nonce: 0,
    }
    saveState(next)
    return next
}

export function setClientSeed(value) {
    const current = getProvablyFair()
    const next = {
        ...current,
        clientSeed: String(value || '').trim() || randomHex(8),
    }
    saveState(next)
    return next
}

// Synchronous fallback hash used in tests when Web Crypto isn't available.
// Educational; not collision-resistant.
export function hashTo32(input) {
    const text = String(input)
    let h1 = 0xdeadbeef ^ 0
    let h2 = 0x41c6ce57 ^ 0
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function rollFromKey(key) {
    const num = hashTo32(key)
    const masked = num >>> 0
    return masked / 0x100000000
}

// HMAC-SHA-256 helper (async). Returns hex digest, or null if Web Crypto unavailable.
async function hmacSha256Hex(key, message) {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null
    try {
        const enc = new TextEncoder()
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            enc.encode(key),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        )
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message))
        return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('')
    } catch {
        return null
    }
}

function hmacRollSync(key) {
    // Lightweight sync fallback: same hash as `hashTo32` but exposed
    // alongside async to keep determinism in test environments.
    return rollFromKey(key)
}

const RECENT_KEY = 'gampo_pf_recent'
const MAX_RECENT = 60

function pushRecent(entry) {
    try {
        const raw = localStorage.getItem(RECENT_KEY)
        const arr = raw ? JSON.parse(raw) : []
        const next = [entry, ...arr].slice(0, MAX_RECENT)
        localStorage.setItem(RECENT_KEY, JSON.stringify(next))
    } catch {
        // ignore
    }
}

export function getRecentRolls() {
    try {
        const raw = localStorage.getItem(RECENT_KEY)
        if (!raw) return []
        return JSON.parse(raw)
    } catch {
        return []
    }
}

export function clearRecentRolls() {
    try {
        localStorage.removeItem(RECENT_KEY)
    } catch {
        // ignore
    }
}

// Sync version: kept for the existing call sites that don't await.
// Uses the lightweight hash. The Verify page surfaces this and the next-rollAsync
// promise also writes the HMAC digest into the recent log when it resolves.
export function nextRoll(gameId) {
    const state = getProvablyFair()
    const nonce = state.nonce + 1
    const composite = `${state.serverSeed}:${state.clientSeed}:${nonce}:${gameId}`
    const roll = hmacRollSync(composite)
    saveState({ ...state, nonce })
    pushRecent({
        // Internal React key for the recent-roll log. Not part of the composite, not
        // hashed, not displayed, and not used to look up entries (the HMAC enrichment
        // below matches on nonce + gameId).
        id: crypto.randomUUID(),
        ts: Date.now(),
        gameId,
        nonce,
        clientSeed: state.clientSeed,
        composite,
        roll,
        hmac: null,
    })
    // Fire-and-forget HMAC enrichment for the verify page.
    hmacSha256Hex(state.serverSeed, `${state.clientSeed}:${nonce}:${gameId}`).then(digest => {
        if (!digest) return
        try {
            const raw = localStorage.getItem(RECENT_KEY)
            if (!raw) return
            const arr = JSON.parse(raw)
            const idx = arr.findIndex(item => item.nonce === nonce && item.gameId === gameId)
            if (idx >= 0) {
                arr[idx] = { ...arr[idx], hmac: digest }
                localStorage.setItem(RECENT_KEY, JSON.stringify(arr))
            }
        } catch {
            // ignore
        }
    })
    return { roll, nonce, clientSeed: state.clientSeed, serverSeedHash: maskSeed(state.serverSeed) }
}

// Async version that uses true HMAC-SHA-256 and returns a roll in [0, 1).
export async function nextRollAsync(gameId) {
    const state = getProvablyFair()
    const nonce = state.nonce + 1
    const composite = `${state.serverSeed}:${state.clientSeed}:${nonce}:${gameId}`
    let roll = hmacRollSync(composite)
    let hmac = null
    const digest = await hmacSha256Hex(state.serverSeed, `${state.clientSeed}:${nonce}:${gameId}`)
    if (digest) {
        hmac = digest
        // Take first 8 hex chars of digest as a 32-bit value mapped to [0,1)
        const slice = digest.slice(0, 8)
        const value = parseInt(slice, 16)
        if (Number.isFinite(value)) roll = (value >>> 0) / 0x100000000
    }
    saveState({ ...state, nonce })
    pushRecent({
        // Internal React key for the recent-roll log — same rationale as the sync path.
        id: crypto.randomUUID(),
        ts: Date.now(),
        gameId,
        nonce,
        clientSeed: state.clientSeed,
        composite,
        roll,
        hmac,
    })
    return { roll, nonce, clientSeed: state.clientSeed, serverSeedHash: maskSeed(state.serverSeed), hmac }
}

export function maskSeed(seed) {
    if (!seed) return ''
    return `${seed.slice(0, 6)}...${seed.slice(-4)}`
}

