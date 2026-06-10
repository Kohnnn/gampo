// Central registry for BigWinOverlay trigger thresholds (profit multiplier at
// which the celebration fires). Previously these were 8 different inline magic
// numbers scattered across the games; tune them here per game instead.
// Lower threshold = celebration fires more often (use for low-multiplier games
// like blackjack); higher = reserved for true outliers (plinko edge bins).

export const BIG_WIN_THRESHOLDS = {
    blackjack: 2.4,
    rps: 2.5,
    war: 3,
    color: 3,
    lottery: 8,
    sicbo: 8,
    keno: 8,
    videopoker: 9,
    packs: 12,
    darts: 12,
    diamonds: 12,
    cases: 12,
    plinko: 15,
}

export const DEFAULT_BIG_WIN_THRESHOLD = 5

export function getBigWinThreshold(gameId) {
    return BIG_WIN_THRESHOLDS[gameId] ?? DEFAULT_BIG_WIN_THRESHOLD
}
