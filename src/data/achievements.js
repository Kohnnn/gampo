// achievements.js — catalog of progression achievements and missions.
//
// Each achievement has:
//   id        — stable string key, used in localStorage
//   group     — 'plays' | 'wins' | 'streak' | 'features' | 'cases' | 'volume'
//   tier      — 'bronze' | 'silver' | 'gold' | 'platinum' (cosmetic)
//   name      — short display string
//   detail    — sentence-long lesson hint
//   icon      — lucide icon name (string keyed in ChatDock)
//   target    — numeric goal
//   evaluate  — fn(stats) -> currentProgress (number)
//
// `stats` is the snapshot produced by useProgress; see hooks/useProgress.js.
//
// Achievements are 100% local; no real money, no real ranks. They only nudge
// the player toward exploring features, comparing volatility, and reading the
// fairness/odds primitives the rest of the app already exposes.

export const ACHIEVEMENTS = [
    // ---- Volume / activity ----
    {
        id: 'first-spin',
        group: 'plays',
        tier: 'bronze',
        name: 'First spin',
        detail: 'Settle a round on any game. Practice credits, no risk.',
        icon: 'play',
        target: 1,
        evaluate: stats => stats.totalRounds,
    },
    {
        id: 'plays-50',
        group: 'plays',
        tier: 'silver',
        name: 'Half a hundred',
        detail: 'Settle 50 rounds. Sample size starts to mean something.',
        icon: 'play',
        target: 50,
        evaluate: stats => stats.totalRounds,
    },
    {
        id: 'plays-500',
        group: 'plays',
        tier: 'gold',
        name: 'Bankroll learner',
        detail: 'Settle 500 rounds. Variance starts to look like math.',
        icon: 'play',
        target: 500,
        evaluate: stats => stats.totalRounds,
    },
    {
        id: 'plays-2500',
        group: 'plays',
        tier: 'platinum',
        name: 'Thousand-round Trial',
        detail: 'Settle 2,500 rounds. RTP is no longer a rumor.',
        icon: 'play',
        target: 2500,
        evaluate: stats => stats.totalRounds,
    },

    // ---- Wins ----
    {
        id: 'first-win',
        group: 'wins',
        tier: 'bronze',
        name: 'First win',
        detail: 'Land a positive-profit round.',
        icon: 'trophy',
        target: 1,
        evaluate: stats => stats.totalWins,
    },
    {
        id: 'wins-25',
        group: 'wins',
        tier: 'silver',
        name: 'Quarter-century',
        detail: 'Stack 25 winning rounds.',
        icon: 'trophy',
        target: 25,
        evaluate: stats => stats.totalWins,
    },
    {
        id: 'wins-200',
        group: 'wins',
        tier: 'gold',
        name: 'Steady earner',
        detail: 'Stack 200 winning rounds across all games.',
        icon: 'trophy',
        target: 200,
        evaluate: stats => stats.totalWins,
    },

    // ---- Streaks ----
    {
        id: 'streak-3',
        group: 'streak',
        tier: 'bronze',
        name: 'Hot start',
        detail: '3 wins in a row on a single game.',
        icon: 'flame',
        target: 3,
        evaluate: stats => stats.bestWinStreak,
    },
    {
        id: 'streak-7',
        group: 'streak',
        tier: 'silver',
        name: 'On a heater',
        detail: '7 wins in a row on a single game.',
        icon: 'flame',
        target: 7,
        evaluate: stats => stats.bestWinStreak,
    },
    {
        id: 'streak-15',
        group: 'streak',
        tier: 'gold',
        name: 'Run-good',
        detail: '15 wins in a row. Variance smiled at you.',
        icon: 'flame',
        target: 15,
        evaluate: stats => stats.bestWinStreak,
    },

    // ---- Big wins / multipliers ----
    {
        id: 'mult-10',
        group: 'features',
        tier: 'bronze',
        name: '10x club',
        detail: 'Land a single round at 10x or higher.',
        icon: 'sparkles',
        target: 10,
        evaluate: stats => stats.bestMultiplier,
    },
    {
        id: 'mult-50',
        group: 'features',
        tier: 'silver',
        name: '50x highlight',
        detail: 'Land a single round at 50x or higher.',
        icon: 'sparkles',
        target: 50,
        evaluate: stats => stats.bestMultiplier,
    },
    {
        id: 'mult-100',
        group: 'features',
        tier: 'gold',
        name: 'Triple-digit',
        detail: 'Land a single round at 100x or higher.',
        icon: 'sparkles',
        target: 100,
        evaluate: stats => stats.bestMultiplier,
    },
    {
        id: 'mult-500',
        group: 'features',
        tier: 'platinum',
        name: 'Top-of-paytable',
        detail: 'Land a single round at 500x or higher. Rare and pretty.',
        icon: 'sparkles',
        target: 500,
        evaluate: stats => stats.bestMultiplier,
    },

    // ---- Game variety ----
    {
        id: 'games-3',
        group: 'features',
        tier: 'bronze',
        name: 'Sampler',
        detail: 'Settle a round in 3 different games.',
        icon: 'compass',
        target: 3,
        evaluate: stats => stats.uniqueGames.length,
    },
    {
        id: 'games-10',
        group: 'features',
        tier: 'silver',
        name: 'Tour guide',
        detail: 'Settle a round in 10 different games.',
        icon: 'compass',
        target: 10,
        evaluate: stats => stats.uniqueGames.length,
    },
    {
        id: 'games-25',
        group: 'features',
        tier: 'gold',
        name: 'Lobby crawler',
        detail: 'Settle a round in 25 different games.',
        icon: 'compass',
        target: 25,
        evaluate: stats => stats.uniqueGames.length,
    },

    // ---- Cases (Wave 18 cross-link) ----
    {
        id: 'cases-rare',
        group: 'cases',
        tier: 'silver',
        name: 'Rare drop',
        detail: 'Open a case Covert or higher rarity skin.',
        icon: 'gift',
        target: 1,
        evaluate: stats => stats.casesRareDrops,
    },
    {
        id: 'cases-50',
        group: 'cases',
        tier: 'gold',
        name: 'Collector',
        detail: 'Stack 50 case drops total.',
        icon: 'gift',
        target: 50,
        evaluate: stats => stats.casesTotalDrops,
    },

    // ---- Volume of credits wagered ----
    {
        id: 'wagered-1k',
        group: 'volume',
        tier: 'bronze',
        name: 'Warmed up',
        detail: 'Wager 1,000 practice credits in total.',
        icon: 'coins',
        target: 1000,
        evaluate: stats => stats.totalWagered,
    },
    {
        id: 'wagered-50k',
        group: 'volume',
        tier: 'silver',
        name: 'Volume player',
        detail: 'Wager 50,000 practice credits in total.',
        icon: 'coins',
        target: 50000,
        evaluate: stats => stats.totalWagered,
    },
    {
        id: 'wagered-500k',
        group: 'volume',
        tier: 'gold',
        name: 'Bankroll burn',
        detail: 'Wager 500,000 practice credits in total.',
        icon: 'coins',
        target: 500000,
        evaluate: stats => stats.totalWagered,
    },

    // ---- Win streaks (extended) ----
    {
        id: 'streak-25',
        group: 'streak',
        tier: 'platinum',
        name: 'Unstoppable',
        detail: '25 wins in a row on a single game. Ride the variance.',
        icon: 'flame',
        target: 25,
        evaluate: stats => stats.bestWinStreak,
    },

    // ---- Resilience (loss-streak survival as a teaching moment) ----
    {
        id: 'downswing-10',
        group: 'streak',
        tier: 'silver',
        name: 'Downswing survivor',
        detail: 'Weather a 10-loss streak. Variance cuts both ways — bankroll management matters.',
        icon: 'flame',
        target: 10,
        evaluate: stats => stats.bestLossStreak,
    },

    // ---- Net profit milestones ----
    {
        id: 'profit-1k',
        group: 'wins',
        tier: 'silver',
        name: 'In the green',
        detail: 'Reach +1,000 practice credits in lifetime net profit.',
        icon: 'trophy',
        target: 1000,
        evaluate: stats => stats.bestProfit,
    },
    {
        id: 'profit-25k',
        group: 'wins',
        tier: 'gold',
        name: 'Session run-up',
        detail: 'Reach +25,000 practice credits in lifetime net profit.',
        icon: 'trophy',
        target: 25000,
        evaluate: stats => stats.bestProfit,
    },

    // ---- Single-hit highlights ----
    {
        id: 'single-win-1k',
        group: 'features',
        tier: 'silver',
        name: 'Big hit',
        detail: 'Win 1,000+ practice credits on a single round.',
        icon: 'sparkles',
        target: 1000,
        evaluate: stats => stats.biggestSingleWin,
    },
    {
        id: 'single-win-10k',
        group: 'features',
        tier: 'platinum',
        name: 'Jackpot moment',
        detail: 'Win 10,000+ practice credits on a single round.',
        icon: 'sparkles',
        target: 10000,
        evaluate: stats => stats.biggestSingleWin,
    },
    {
        id: 'mult-1000',
        group: 'features',
        tier: 'platinum',
        name: 'Four-figure multiplier',
        detail: 'Land a single round at 1000x or higher. The very top of the paytable.',
        icon: 'sparkles',
        target: 1000,
        evaluate: stats => stats.bestMultiplier,
    },

    // ---- Game variety (extended) ----
    {
        id: 'games-40',
        group: 'features',
        tier: 'platinum',
        name: 'Completionist',
        detail: 'Settle a round in 40 different games. You have seen the whole lobby.',
        icon: 'compass',
        target: 40,
        evaluate: stats => stats.uniqueGames.length,
    },

    // ---- Slot bonus engagement ----
    {
        id: 'bonus-first',
        group: 'bonus',
        tier: 'bronze',
        name: 'Bonus unlocked',
        detail: 'Trigger your first slot bonus feature (free spins, wheel, hold & respin...).',
        icon: 'gift',
        target: 1,
        evaluate: stats => stats.bonusRoundsTriggered,
    },
    {
        id: 'bonus-25',
        group: 'bonus',
        tier: 'silver',
        name: 'Feature hunter',
        detail: 'Trigger 25 slot bonus features across any templates.',
        icon: 'gift',
        target: 25,
        evaluate: stats => stats.bonusRoundsTriggered,
    },
    {
        id: 'freespins-100',
        group: 'bonus',
        tier: 'gold',
        name: 'Free spin farmer',
        detail: 'Accumulate 100 awarded free spins across all slots.',
        icon: 'sparkles',
        target: 100,
        evaluate: stats => stats.freeSpinsAwarded,
    },
]

export const ACHIEVEMENT_GROUPS = {
    plays: { label: 'Activity', sort: 1 },
    wins: { label: 'Wins', sort: 2 },
    streak: { label: 'Streaks', sort: 3 },
    features: { label: 'Features', sort: 4 },
    bonus: { label: 'Bonus Rounds', sort: 5 },
    cases: { label: 'Cases', sort: 6 },
    volume: { label: 'Volume', sort: 7 },
}

export function evaluateAchievements(stats) {
    return ACHIEVEMENTS.map(ach => {
        const value = ach.evaluate(stats) || 0
        const progress = Math.min(value, ach.target)
        const ratio = ach.target > 0 ? Math.min(1, progress / ach.target) : 0
        return {
            ...ach,
            value,
            progress,
            ratio,
            complete: value >= ach.target,
        }
    })
}
