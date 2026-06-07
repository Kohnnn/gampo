// rewards.js — single-player reward definitions.
//
// Three streams (all grant practice credits via CreditContext; never real cash):
//   1. Starter pack: one-time choice when a player first wants a boost. Free
//      play remains the default — the pack is opt-in.
//   2. Daily claim: a once-per-calendar-day credit top-up to keep sessions warm.
//   3. Level rewards: each XP level reached grants a one-time claimable credit
//      bundle that scales with level.

export const STARTER_PACKS = [
    {
        id: 'free',
        label: 'Keep Free Play',
        credits: 0,
        detail: 'Stay on the default GC 1,000 sandbox. No boost — pure practice.',
        icon: 'sparkles',
    },
    {
        id: 'starter',
        label: 'Starter Stack',
        credits: 5000,
        detail: 'A one-time GC 5,000 top-up to explore higher stakes.',
        icon: 'coins',
    },
    {
        id: 'pro',
        label: 'High Roller Stack',
        credits: 25000,
        detail: 'A one-time GC 25,000 bankroll for deep sessions and bonus buys.',
        icon: 'trophy',
    },
]

export const DAILY_CLAIM_CREDITS = 500

// Opt-in single-player progression pack. A fixed GC 1,000 top-up the player can
// grant whenever they want to "make their way up" — free play (default GC 1,000
// sandbox) is never disturbed. Repeatable; the claim count is tracked so the UI
// can show progression. Never real money.
export const PROGRESS_PACK_CREDITS = 1000

// Credits granted for reaching a level. Scales gently; milestone levels pay more.
export function levelRewardCredits(level) {
    const lvl = Math.max(1, Math.floor(level))
    if (lvl <= 1) return 0
    const milestone = lvl % 10 === 0 ? 2000 : lvl % 5 === 0 ? 750 : 0
    return 100 + (lvl - 1) * 40 + milestone
}
