import { MAX_FREE_SPINS_PER_SESSION } from './slotConstants'

export function applyFreeSpinAward(session, rawAward) {
    return Math.max(0, Math.min(rawAward, MAX_FREE_SPINS_PER_SESSION - (session?.totalAwarded || 0)))
}

export function shouldStopAutoplay({ baseline, settledBalance, outcome, stops }) {
    const net = settledBalance - baseline
    const spinProfit = Number(outcome?.profit) || 0

    return Boolean(
        (stops.stopOnFeature && outcome?.featureEvents?.length)
        || (stops.stopOnBigWin && outcome?.multiplier >= stops.bigWinThreshold)
        || (stops.stopOnLoss && settledBalance <= baseline * (1 - stops.lossPercent / 100))
        || (stops.stopOnGain && settledBalance >= baseline * (1 + stops.gainPercent / 100))
        || (stops.stopOnLossAbs && stops.lossAbs > 0 && net <= -stops.lossAbs)
        || (stops.stopOnGainAbs && stops.gainAbs > 0 && net >= stops.gainAbs)
        || (stops.stopOnSingleWin && stops.singleWinAbs > 0 && spinProfit >= stops.singleWinAbs)
    )
}
