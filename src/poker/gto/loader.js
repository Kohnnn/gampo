// Lazy-loaded GTO chart data. Resolves once and caches.
// Reads from /data/poker/preflop.json and /data/poker/postflop.json
// (committed under public/data/poker).

let preflopPromise = null
let postflopPromise = null

export function loadPreflop() {
    if (!preflopPromise) {
        preflopPromise = fetch('/data/poker/preflop.json').then(r => r.json()).catch(() => null)
    }
    return preflopPromise
}

export function loadPostflop() {
    if (!postflopPromise) {
        postflopPromise = fetch('/data/poker/postflop.json').then(r => r.json()).catch(() => null)
    }
    return postflopPromise
}

export function preloadGto() {
    return Promise.all([loadPreflop(), loadPostflop()])
}

export function clearGtoCache() {
    preflopPromise = null
    postflopPromise = null
}
