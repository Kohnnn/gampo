const HOUSE_EDGE = 0.01

export function rollCrashMultiplier(uniform) {
    const u = Math.max(1e-9, Math.min(1 - 1e-9, uniform))
    if (u < HOUSE_EDGE) return 1.0
    const m = (1 - HOUSE_EDGE) / (1 - u)
    return Math.max(1.0, Math.floor(m * 100) / 100)
}
