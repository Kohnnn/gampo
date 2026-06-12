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
    {
        id: 'daily-profit-50',
        name: 'Green day',
        detail: 'Finish today up at least +50 net practice credits.',
        period: 'daily',
        icon: 'trophy',
        target: 50,
        reward: { credits: 15 },
        evaluate: stats => Math.max(0, stats.daily.netProfit || 0),
    },
    {
        id: 'daily-wagered-250',
        name: 'Daily volume',
        detail: 'Wager 250 practice credits today.',
        period: 'daily',
        icon: 'coins',
        target: 250,
        reward: { credits: 10 },
        evaluate: stats => stats.daily.wagered,
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
    {
        id: 'weekly-5-games',
        name: 'Variety week',
        detail: 'Play 5 different games this week.',
        period: 'weekly',
        icon: 'compass',
        target: 5,
        reward: { credits: 70 },
        evaluate: stats => stats.weekly.uniqueGames,
    },
    {
        id: 'weekly-bigwin-500',
        name: 'Weekly highlight',
        detail: 'Win 500+ practice credits on a single round this week.',
        period: 'weekly',
        icon: 'trophy',
        target: 500,
        reward: { credits: 140 },
        evaluate: stats => stats.weekly.bestSingleWin,
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
    {
        id: 'lifetime-games-40',
        name: 'Seen it all',
        detail: 'Play 40 different games across the whole lobby.',
        period: 'lifetime',
        icon: 'compass',
        target: 40,
        reward: { credits: 600 },
        evaluate: stats => stats.lifetime.uniqueGames,
    },
    {
        id: 'lifetime-wagered-100000',
        name: 'Six-figure volume',
        detail: 'Wager 100,000 credits all-time.',
        period: 'lifetime',
        icon: 'coins',
        target: 100000,
        reward: { credits: 1500 },
        evaluate: stats => stats.lifetime.wagered,
    },
    {
        id: 'lifetime-multi-500',
        name: 'Top of the paytable',
        detail: 'Land a 500x+ multiplier ever.',
        period: 'lifetime',
        icon: 'sparkles',
        target: 500,
        reward: { credits: 1000 },
        evaluate: stats => stats.lifetime.bestMultiplier,
    },
]

export const MISSION_PERIODS = {
    daily: { label: 'Daily', sort: 1 },
    weekly: { label: 'Weekly', sort: 2 },
    lifetime: { label: 'Lifetime', sort: 3 },
}

export function evaluateMissions(stats) {
    return MISSIONS.map(m => {
        const rawValue = m.evaluate(stats) || 0
        const value = Array.isArray(rawValue) ? rawValue.length : rawValue
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

// ---- Rotating daily challenge (Wave 2026-06-12) ----
// A single bonus challenge that rotates each calendar day, deterministically
// picked from this pool by the date. It reads the same `daily` period counters
// useMissions already tracks, so no new persistence is needed. Completing it is
// a stretch goal on top of the fixed daily missions, with a richer reward.
export const DAILY_CHALLENGE_POOL = [
    { id: 'chal-spin-30', name: 'Marathon', detail: 'Settle 30 rounds today.', icon: 'flame', target: 30, reward: { credits: 600 }, evaluate: s => s.daily.rounds },
    { id: 'chal-win-12', name: 'Dozen wins', detail: 'Win 12 rounds today.', icon: 'trophy', target: 12, reward: { credits: 600 }, evaluate: s => s.daily.wins },
    { id: 'chal-streak-5', name: 'On a roll', detail: 'Hit a 5-win streak today.', icon: 'flame', target: 5, reward: { credits: 700 }, evaluate: s => s.daily.bestStreak },
    { id: 'chal-mult-20', name: 'Catch a 20×', detail: 'Land a 20× win today.', icon: 'sparkles', target: 20, reward: { credits: 700 }, evaluate: s => s.daily.bestMultiplier },
    { id: 'chal-games-5', name: 'Sampler', detail: 'Play 5 different games today.', icon: 'compass', target: 5, reward: { credits: 500 }, evaluate: s => (Array.isArray(s.daily.uniqueGames) ? s.daily.uniqueGames.length : 0) },
    { id: 'chal-wager-2k', name: 'High roller', detail: 'Wager 2,000 GC today.', icon: 'coins', target: 2000, reward: { credits: 800 }, evaluate: s => s.daily.wagered },
    { id: 'chal-mult-50', name: 'Big swing', detail: 'Land a 50× win today.', icon: 'sparkles', target: 50, reward: { credits: 900 }, evaluate: s => s.daily.bestMultiplier },
]

// Stable day index → deterministic challenge for the day.
export function dailyChallengeFor(dateKey = '') {
    let hash = 0
    for (let i = 0; i < dateKey.length; i += 1) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0
    const pick = DAILY_CHALLENGE_POOL[hash % DAILY_CHALLENGE_POOL.length]
    return pick
}

export function evaluateDailyChallenge(stats, dateKey) {
    const c = dailyChallengeFor(dateKey)
    const rawValue = c.evaluate(stats) || 0
    const value = Array.isArray(rawValue) ? rawValue.length : rawValue
    const progress = Math.min(value, c.target)
    const ratio = c.target > 0 ? Math.min(1, progress / c.target) : 0
    return { ...c, value, progress, ratio, complete: value >= c.target }
}
