export function deriveSessionRecap({ progressStats = {}, missionSummary = {}, challenge = null, xp = {} } = {}) {
    const rounds = Number(progressStats.totalRounds) || 0
    const wins = Number(progressStats.totalWins) || 0
    const losses = Number(progressStats.totalLosses) || 0
    const profit = Number(progressStats.totalProfit) || 0
    const wagered = Number(progressStats.totalWagered) || 0
    const bestMultiplier = Number(progressStats.bestMultiplier) || 0
    const biggestSingleWin = Number(progressStats.biggestSingleWin) || 0
    const currentDayStreak = Number(progressStats.currentDayStreak) || 0
    const uniqueGames = Array.isArray(progressStats.uniqueGames) ? progressStats.uniqueGames.length : 0

    const missionBuckets = Object.values(missionSummary || {})
    const missionsComplete = missionBuckets.reduce((sum, bucket) => sum + (Number(bucket?.complete) || 0), 0)
    const missionsTotal = missionBuckets.reduce((sum, bucket) => sum + (Number(bucket?.total) || 0), 0)
    const missionsClaimed = missionBuckets.reduce((sum, bucket) => sum + (Number(bucket?.claimed) || 0), 0)

    const winRate = rounds > 0 ? wins / rounds : 0
    const rtp = wagered > 0 ? (wagered + profit) / wagered : null
    const mood = rounds === 0
        ? 'Ready to warm up'
        : profit > 0
            ? 'Ahead on practice credits'
            : profit < 0
                ? 'Variance check'
                : 'Flat session'

    const nextAction = pickNextAction({ rounds, challenge, missionsComplete, missionsTotal, profit, uniqueGames })
    const educationNote = pickEducationNote({ rounds, profit, rtp, bestMultiplier, biggestSingleWin, challenge })

    return {
        rounds,
        wins,
        losses,
        winRate,
        profit,
        wagered,
        rtp,
        bestMultiplier,
        biggestSingleWin,
        currentDayStreak,
        uniqueGames,
        missionsComplete,
        missionsTotal,
        missionsClaimed,
        challengeName: challenge?.name || 'Daily challenge',
        challengeProgress: Number(challenge?.ratio) || 0,
        challengeComplete: Boolean(challenge?.complete),
        level: Number(xp.level) || 1,
        rankLabel: xp.rank?.current?.label || 'Rookie',
        xpProgress: Number(xp.progress) || 0,
        mood,
        nextAction,
        educationNote,
    }
}

function pickNextAction({ rounds, challenge, missionsComplete, missionsTotal, profit, uniqueGames }) {
    if (rounds === 0) return "Play one Original or slot to start today's recap."
    if (challenge?.claimable) return "Claim today's challenge reward in Progress."
    if (challenge && !challenge.complete) return `Push the daily challenge: ${challenge.name}.`
    if (missionsTotal > 0 && missionsComplete < missionsTotal) return 'Finish one open mission before switching games.'
    if (uniqueGames < 3) return 'Sample more game types to unlock variety progress.'
    if (profit < 0) return 'Try a lower-volatility game and compare the math panel.'
    return 'Bank the session or chase a new personal best with practice credits.'
}

function pickEducationNote({ rounds, profit, rtp, bestMultiplier, biggestSingleWin, challenge }) {
    if (rounds === 0) return 'Every result is fake-credit only; use the math panels to compare risk before playing.'
    if (challenge?.complete) return 'Challenge complete. Claiming rewards does not change the real-money status: credits stay practice-only.'
    if (bestMultiplier >= 20 || biggestSingleWin >= 500) return 'Big hits are variance spikes. Judge the decision by price and risk, not only the outcome.'
    if (profit < 0) return 'Downswings are expected in high-volatility games. Smaller bets make the lesson last longer.'
    if (rtp !== null && rtp > 1.1) return 'Short-session RTP can run hot; long-run RTP still follows each game paytable.'
    return 'Good session pacing: compare volatility, RTP, and hit frequency before raising stake size.'
}
