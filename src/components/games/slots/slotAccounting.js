import { MAX_FREE_SPINS_PER_SESSION } from './slotConstants'

export function applyFreeSpinAward(session, rawAward) {
    return Math.max(0, Math.min(rawAward, MAX_FREE_SPINS_PER_SESSION - (session?.totalAwarded || 0)))
}

export function getAutoplayStopReason({ baseline, settledBalance, outcome, stops }) {
    const net = settledBalance - baseline
    const spinProfit = Number(outcome?.profit) || 0

    if (stops.stopOnFeature && outcome?.featureEvents?.length) return 'feature'
    if (stops.stopOnBigWin && outcome?.multiplier >= stops.bigWinThreshold) return 'big-win'
    if (stops.stopOnLoss && settledBalance <= baseline * (1 - stops.lossPercent / 100)) return 'loss-percent'
    if (stops.stopOnGain && settledBalance >= baseline * (1 + stops.gainPercent / 100)) return 'gain-percent'
    if (stops.stopOnLossAbs && stops.lossAbs > 0 && net <= -stops.lossAbs) return 'loss-credits'
    if (stops.stopOnGainAbs && stops.gainAbs > 0 && net >= stops.gainAbs) return 'gain-credits'
    if (stops.stopOnSingleWin && stops.singleWinAbs > 0 && spinProfit >= stops.singleWinAbs) return 'single-win'
    return null
}

