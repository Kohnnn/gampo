// Deterministic round RNG used by the originals event machine.
//
// Goal: simulator-grade determinism so a given seed always produces the same
// visible outcome. This is NOT production casino math; the provably-fair
// pipeline lives in `docs/provably-fair.md` and stays separate.
//
// Algorithm: 32-bit LCG (Numerical Recipes constants). Seed is hashed from a
// string via FNV-1a so the seed can come from `crypto.randomUUID()`,
// timestamp + nonce, or a deterministic test vector.
//
// Public API:
//   const rng = createRoundRng(seed?)
//   rng.seed       // string the caller passed in or randomUUID
//   rng.next()     // float in [0, 1)
//   rng.nextInt(n) // integer in [0, n)
//   rng.pick(arr)  // arr[ Math.floor(next * arr.length) ]
//   rng.fork(tag)  // child rng deterministic from this rng + tag

function fnv1a(str) {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i)
        h = Math.imul(h, 0x01000193)
    }
    return h >>> 0
}

function makeRng(seedString) {
    let state = fnv1a(seedString) || 1
    function next() {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0
        return state / 0x100000000
    }
    return {
        seed: seedString,
        next,
        nextInt(n) {
            if (!Number.isFinite(n) || n <= 0) return 0
            return Math.floor(next() * n)
        },
        pick(arr) {
            if (!Array.isArray(arr) || arr.length === 0) return undefined
            return arr[Math.floor(next() * arr.length)]
        },
        fork(tag = '') {
            const childSeed = `${seedString}::${tag}::${state.toString(36)}`
            return makeRng(childSeed)
        },
    }
}

function genUuidLike() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createRoundRng(seed) {
    const finalSeed = typeof seed === 'string' && seed.length > 0 ? seed : genUuidLike()
    return makeRng(finalSeed)
}
