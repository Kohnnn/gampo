export const FEEDBACK_EVENTS = {
    BET: 'bet',
    SPIN_START: 'spin-start',
    REEL_STOP: 'reel-stop',
    ANTICIPATION: 'anticipation',
    REVEAL: 'reveal',
    LOSE: 'lose',
    WIN: 'win',
    BIG_WIN: 'big-win',
    BONUS_ENTER: 'bonus-enter',
    BONUS_COMPLETE: 'bonus-complete',
    MISSION_COMPLETE: 'mission-complete',
    REWARD_CLAIM: 'reward-claim',
    LEVEL_UP: 'level-up',
}

const FEEDBACK_PROFILES = {
    [FEEDBACK_EVENTS.BET]: { sfx: 'click', haptic: 'select', volume: 0.45 },
    [FEEDBACK_EVENTS.SPIN_START]: { sfx: 'spinStart', haptic: 'select', volume: 0.75 },
    [FEEDBACK_EVENTS.REEL_STOP]: { sfx: 'reelStop', haptic: 'tick', volume: 0.55 },
    [FEEDBACK_EVENTS.ANTICIPATION]: { sfx: 'anticipation', haptic: 'land', volume: 0.7 },
    [FEEDBACK_EVENTS.REVEAL]: { sfx: 'reveal', haptic: 'tick', volume: 0.55 },
    [FEEDBACK_EVENTS.LOSE]: { sfx: 'lose', haptic: 'error', volume: 0.55 },
    [FEEDBACK_EVENTS.WIN]: { sfx: 'win', haptic: 'win', volume: 0.7 },
    [FEEDBACK_EVENTS.BIG_WIN]: { sfx: 'bigwin', haptic: 'rare', volume: 0.95, forceHaptic: true },
    [FEEDBACK_EVENTS.BONUS_ENTER]: { sfx: 'bonusEnter', haptic: 'rare', volume: 0.9, forceHaptic: true },
    [FEEDBACK_EVENTS.BONUS_COMPLETE]: { sfx: 'moneyCollect', haptic: 'win', volume: 0.85, forceHaptic: true },
    [FEEDBACK_EVENTS.MISSION_COMPLETE]: { sfx: 'win', haptic: 'win', volume: 0.75 },
    [FEEDBACK_EVENTS.REWARD_CLAIM]: { sfx: 'cashout', haptic: 'win', volume: 0.75 },
    [FEEDBACK_EVENTS.LEVEL_UP]: { sfx: 'bigwin', haptic: 'rare', volume: 0.9, forceHaptic: true },
}

export function feedbackProfile(event) {
    return FEEDBACK_PROFILES[event] || null
}

export function playFeedback(event, { sfx, haptic, hapticsEnabled, volume } = {}) {
    const profile = feedbackProfile(event)
    if (!profile) return { playedSfx: false, playedHaptic: false }

    const playedSfx = Boolean(sfx?.play?.(profile.sfx, { volume: volume ?? profile.volume }))
    const playedHaptic = Boolean(haptic?.(profile.haptic, { enabled: hapticsEnabled, force: profile.forceHaptic }))
    return { playedSfx, playedHaptic }
}
