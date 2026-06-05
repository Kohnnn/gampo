// xpLevels.js — XP curve, rank tiers, and XP award rules for the single-player
// progression layer. Practice-only; XP has no cash value and never converts to
// credits. It exists to give the educational simulator a sense of forward
// momentum and to gate cosmetic rank badges.
//
// Design:
//   - XP is awarded on every settled round (see useXp.recordRound) from a small
//     base plus scaled bonuses for wagering volume, wins, win-multiplier size,
//     and discovering new games. Numbers are intentionally modest so reaching a
//     new level takes deliberate play rather than a single lucky spin.
//   - The level curve is quadratic-ish: each level needs a bit more than the
//     last. xpForLevel(n) returns the cumulative XP needed to *reach* level n.
//   - 12 named rank tiers map ranges of levels to a cosmetic badge + accent.
//
// All pure functions here are covered by xpLevels.test.js.

export const MAX_LEVEL = 100

// XP awarded per settled round. Tunable in one place.
export const XP_RULES = {
    base: 6,                 // every settled round
    perWagerUnit: 0.4,       // xp per 1 credit wagered (capped)
    wagerCap: 60,            // max xp from wager on a single round
    win: 8,                  // flat bonus when profit > 0
    multiplierStep: 2,       // xp per 1x of win multiplier (capped)
    multiplierCap: 80,       // max xp from a single big-multiplier hit
    newGame: 40,             // one-time bonus the first time a game is played
    dailyFirstRound: 25,     // bonus on the first settled round of a calendar day
}

// Cumulative XP required to *reach* a given level (level 1 = 0).
// Smooth quadratic growth: level L needs ~ 60*L + 14*L^2 total XP.
export function xpForLevel(level) {
    const L = Math.max(1, Math.floor(level)) - 1
    if (L <= 0) return 0
    return Math.round(60 * L + 14 * L * L)
}

// Resolve a total XP value into { level, intoLevel, span, toNext, progress }.
export function levelForXp(totalXp) {
    const xp = Math.max(0, Number(totalXp) || 0)
    let level = 1
    while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) {
        level += 1
    }
    const floor = xpForLevel(level)
    const ceil = level >= MAX_LEVEL ? xpForLevel(MAX_LEVEL) : xpForLevel(level + 1)
    const span = Math.max(1, ceil - floor)
    const intoLevel = xp - floor
    const toNext = level >= MAX_LEVEL ? 0 : Math.max(0, ceil - xp)
    return {
        level,
        intoLevel,
        span,
        toNext,
        progress: level >= MAX_LEVEL ? 1 : Math.min(1, intoLevel / span),
        atMax: level >= MAX_LEVEL,
    }
}

// Cosmetic rank tiers. minLevel is inclusive; resolved by rankForLevel.
export const RANK_TIERS = [
    { id: 'rookie', label: 'Rookie', minLevel: 1, icon: 'sparkles', accent: '#8aa0b2' },
    { id: 'apprentice', label: 'Apprentice', minLevel: 5, icon: 'compass', accent: '#69c0ff' },
    { id: 'dealer', label: 'Dealer', minLevel: 10, icon: 'play', accent: '#36d399' },
    { id: 'shark', label: 'Card Shark', minLevel: 18, icon: 'flame', accent: '#00e701' },
    { id: 'highroller', label: 'High Roller', minLevel: 28, icon: 'coins', accent: '#ffd166' },
    { id: 'strategist', label: 'Strategist', minLevel: 40, icon: 'trophy', accent: '#ffb020' },
    { id: 'whale', label: 'Whale', minLevel: 55, icon: 'gift', accent: '#c084fc' },
    { id: 'legend', label: 'Legend', minLevel: 72, icon: 'trophy', accent: '#ff7ac6' },
    { id: 'mythic', label: 'Mythic', minLevel: 90, icon: 'sparkles', accent: '#f87171' },
]

export function rankForLevel(level) {
    const lvl = Math.max(1, Math.floor(level))
    let current = RANK_TIERS[0]
    let next = null
    for (let i = 0; i < RANK_TIERS.length; i += 1) {
        if (lvl >= RANK_TIERS[i].minLevel) {
            current = RANK_TIERS[i]
            next = RANK_TIERS[i + 1] || null
        }
    }
    return { current, next }
}

// Compute the XP awarded for a single settled round. Pure + deterministic so it
// can be unit-tested. `flags` carries one-time bonuses resolved by the hook.
export function xpForRound({ profit = 0, betAmount = 0, multiplier = 0 } = {}, flags = {}) {
    const r = XP_RULES
    let xp = r.base
    const wager = Math.max(0, Number(betAmount) || 0)
    xp += Math.min(r.wagerCap, wager * r.perWagerUnit)
    if (Number(profit) > 0) xp += r.win
    const mult = Math.max(0, Number(multiplier) || 0)
    if (mult > 1) xp += Math.min(r.multiplierCap, (mult - 1) * r.multiplierStep)
    if (flags.newGame) xp += r.newGame
    if (flags.dailyFirstRound) xp += r.dailyFirstRound
    return Math.round(xp)
}
