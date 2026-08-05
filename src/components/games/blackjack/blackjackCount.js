const HI_LO_TAGS = {
    2: 1,
    3: 1,
    4: 1,
    5: 1,
    6: 1,
    7: 0,
    8: 0,
    9: 0,
    10: -1,
    J: -1,
    Q: -1,
    K: -1,
    A: -1,
}

export function hiLoTag(card) {
    return HI_LO_TAGS[card?.rank] ?? 0
}

export function createBlackjackCount(initialCards = 0) {
    return {
        initialCards: Number.isFinite(initialCards) && initialCards > 0 ? initialCards : 0,
        dealtCards: 0,
        runningCount: 0,
        dealt: new Set(),
        observed: new Set(),
    }
}

export function dealCards(state, cards = []) {
    const dealt = new Set(state.dealt)
    let dealtCards = state.dealtCards
    for (const card of cards) {
        if (!Object.hasOwn(HI_LO_TAGS, card?.rank) || dealt.has(card)) continue
        dealt.add(card)
        dealtCards += 1
    }
    return { ...state, dealtCards, dealt }
}

export function observeCards(state, cards = []) {
    const observed = new Set(state.observed)
    let runningCount = state.runningCount
    for (const card of cards) {
        if (!Object.hasOwn(HI_LO_TAGS, card?.rank) || observed.has(card)) continue
        observed.add(card)
        runningCount += hiLoTag(card)
    }
    return { ...state, runningCount, observed }
}

export function countMetrics(state) {
    const penetration = state.initialCards > 0 ? Math.max(0, Math.min(1, state.dealtCards / state.initialCards)) : 0
    const remainingDecks = Math.max(0, state.initialCards - state.dealtCards) / 52
    return {
        penetration,
        remainingDecks,
        trueCount: remainingDecks === 0 ? null : Math.trunc(state.runningCount / remainingDecks),
    }
}
