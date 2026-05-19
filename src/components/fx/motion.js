// Lazy framer-motion loader so the home/lobby chunk stays small.
// Re-exports common APIs from framer-motion via dynamic import.

let cached = null

export async function loadMotion() {
    if (cached) return cached
    const mod = await import('framer-motion')
    cached = {
        motion: mod.motion,
        AnimatePresence: mod.AnimatePresence,
        useMotionValue: mod.useMotionValue,
        useSpring: mod.useSpring,
        useTransform: mod.useTransform,
        useReducedMotion: mod.useReducedMotion,
    }
    return cached
}
