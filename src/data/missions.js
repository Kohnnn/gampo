// missions.js — Wave 25 mission catalog.
//
// Missions are time-boxed goals (daily / weekly / lifetime). Each mission
// declares:
//   id        — stable string key
//   name      — short display string
//   detail    — sentence-long copy
//   reward    — { credits } cosmetic-only payout for completion
//   period    — 'daily' | 'weekly' | 'lifetime'
//   icon      — lucide name string
//   target    — numeric goal
//   evaluate  — fn(stats) -> currentProgress (number)
//
// `stats` is the snapshot from useMissions: live progression stats plus
// the per-period rolling counters (rounds today / wagered today / etc).

export const MISSIONS = [
    // ---- Daily ----
    {
        id: 'daily-spins-10',
        name: 'Warmup',
        detail: 'Settle 10 rounds today.',
        period: 'daily',
        icon: 'play',
        target: 10,
        reward: { credits: 5 },
        evaluate: stats => stats.daily.rounds,
    },
    {
        id: 'daily-wins-3',
        name: 'Three on the board',
        detail: 'Land 3 winning rounds today.',
        period: 'daily',
        icon: 'trophy',
        target: 3,
        reward: { credits: 10 },
        evaluate: stats => stats.daily.wins,
    },
    {
        id: 'daily-multi-5',
        name: '5x or better',
        detail: 'Hit a 5x+ multiplier in any round today.',
        period: 'daily',
        icon: 'sparkles',
        target: 5,
        reward: { credits: 12 },
        evaluate: stats => stats.daily.bestMultiplier,
    },
    {
        id: 'daily-3-games',
        name: 'Sampler day',
        detail: 'Play 3 different games today.',
        period: 'daily',
        icon: 'compass',
        target: 3,
        reward: { credits: 8 },
        evaluate: stats => stats.daily.uniqueGames,
    },

    // ---- Weekly ----
    {
        id: 'weekly-spins-100',
        name: 'Volume week',
        detail: 'Settle 100 rounds this week.',
        period: 'weekly',
        icon: 'play',
        target: 100,
        reward: { credits: 60 },
        evaluate: stats => stats.weekly.rounds,
    },
    {
        id: 'weekly-wagered-1000',
        name: 'Bankroll burn',
        detail: 'Wager 1,000 credits this week.',
        period: 'weekly',
        icon: 'coins',
        target: 1000,
        reward: { credits: 80 },
        evaluate: stats => stats.weekly.wagered,
    },
    {
        id: 'weekly-streak-5',
        name: 'On a heater',
        detail: 'Stack a 5-win streak on a single game this week.',
        period: 'weekly',
        icon: 'flame',
        target: 5,
        reward: { credits: 80 },
        evaluate: stats => stats.weekly.bestStreak,
    },
    {
        id: 'weekly-multi-25',
        name: '25x sighting',
        detail: 'Land a 25x+ multiplier this week.',
        period: 'weekly',
        icon: 'sparkles',
        target: 25,
        reward: { credits: 120 },
        evaluate: stats => stats.weekly.bestMultiplier,
    },

    // ---- Lifetime ----
    {
        id: 'lifetime-spins-1000',
        name: 'Thousand club',
        detail: 'Settle 1,000 rounds across all games.',
        period: 'lifetime',
        icon: 'play',
        target: 1000,
        reward: { credits: 250 },
        evaluate: stats => stats.lifetime.rounds,
    },
    {
        id: 'lifetime-wagered-10000',
        name: 'High volume',
        detail: 'Wager 10,000 credits all-time.',
        period: 'lifetime',
        icon: 'coins',
        target: 10000,
        reward: { credits: 400 },
        evaluate: stats => stats.lifetime.wagered,
    },
    {
        id: 'lifetime-multi-100',
        name: 'Triple-digit hit',
        detail: 'Land a 100x+ multiplier ever.',
        period: 'lifetime',
        icon: 'sparkles',
        target: 100,
        reward: { credits: 500 },
        evaluate: stats => stats.lifetime.bestMultiplier,
    },
    {
        id: 'lifetime-games-15',
        name: 'Lobby crawler',
        detail: 'Play 15 different games.',
        period: 'lifetime',
        icon: 'compass',
        target: 15,
        reward: { credits: 200 },
        evaluate: stats => stats.lifetime.uniqueGames,
    },
]

export const MISSION_PERIODS = {
    daily: { label: 'Daily', sort: 1 },
    weekly: { label: 'Weekly', sort: 2 },
    lifetime: { label: 'Lifetime', sort: 3 },
}

export function evaluateMissions(stats) {
    return MISSIONS.map(m => {
        const value = m.evaluate(stats) || 0
        const progress = Math.min(value, m.target)
        const ratio = m.target > 0 ? Math.min(1, progress / m.target) : 0
        return {
            ...m,
            value,
            progress,
            ratio,
            complete: value >= m.target,
        }
    })
}

// VIP tier ladder, unlocked by `lifetime.wagered`.
export const VIP_TIERS = [
    { id: 'rookie', label: 'Rookie', wager: 0, perk: 'Welcome to GamPo Lab.' },
    { id: 'bronze', label: 'Bronze', wager: 1000, perk: 'Daily spin reward unlocked.' },
    { id: 'silver', label: 'Silver', wager: 10000, perk: 'Weekly mission rewards +25%.' },
    { id: 'gold', label: 'Gold', wager: 50000, perk: 'Bonus claim every 24h.' },
    { id: 'platinum', label: 'Platinum', wager: 250000, perk: 'Custom chip skin unlocked.' },
    { id: 'diamond', label: 'Diamond', wager: 1000000, perk: 'GamPo Lab founder badge.' },
]

export function vipTierFor(wagered) {
    let current = VIP_TIERS[0]
    let next = null
    for (const tier of VIP_TIERS) {
        if (wagered >= tier.wager) current = tier
        else if (!next) next = tier
    }
    return { current, next }
}
