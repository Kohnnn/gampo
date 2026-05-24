import { createRoundRng } from '../utils/roundRng'

export const BET_MODES = {
    SINGLES: 'singles',
    MULTI: 'multi',
    SYSTEM_2: 'system-2',
}

export const ODDS_POLICIES = {
    ACCEPT_ANY: 'accept-any',
    ACCEPT_HIGHER: 'accept-higher',
    NO_CHANGES: 'no-changes',
}

export function roundCurrency(value) {
    return Number((Math.round((Number(value) + Number.EPSILON) * 100) / 100).toFixed(2))
}

export function impliedProbability(decimalOdds) {
    const odds = Number(decimalOdds)
    if (!Number.isFinite(odds) || odds <= 1) return 0
    return 1 / odds
}

export function overround(decimalOdds) {
    return decimalOdds.reduce((sum, odds) => sum + impliedProbability(odds), 0)
}

export function vig(decimalOdds) {
    return Math.max(0, overround(decimalOdds) - 1)
}

export function deVigProbabilities(decimalOdds) {
    const raw = decimalOdds.map(impliedProbability)
    const total = raw.reduce((sum, probability) => sum + probability, 0)
    if (total <= 0) return raw.map(() => 0)
    return raw.map(probability => probability / total)
}

export function fairDecimalOdds(probability) {
    const p = Math.min(0.9999, Math.max(0.0001, Number(probability) || 0))
    return roundCurrency(1 / p)
}

export function combinatorial(n, k) {
    if (k < 0 || k > n) return 0
    let result = 1
    for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i
    return result
}

export function quoteTicket({ selections = [], stake = 0, mode = BET_MODES.SINGLES }) {
    const amount = Math.max(0, Number(stake) || 0)
    const count = selections.length
    if (count === 0 || amount <= 0) {
        return {
            mode,
            stake: amount,
            count,
            totalOdds: 0,
            estimatedPayout: 0,
            impliedChance: 0,
            modelChance: 0,
            combinations: 0,
            expectedValue: 0,
        }
    }

    if (mode === BET_MODES.SINGLES) {
        const stakePerLeg = amount / count
        const estimatedPayout = selections.reduce((sum, selection) => (
            sum + stakePerLeg * Number(selection.currentOdds || selection.acceptedOdds || 0)
        ), 0)
        const expectedReturn = selections.reduce((sum, selection) => {
            const probability = Number(selection.trueProbability) || 0
            const odds = Number(selection.currentOdds || selection.acceptedOdds || 0)
            return sum + stakePerLeg * probability * odds
        }, 0)
        return {
            mode,
            stake: amount,
            count,
            stakePerLeg: roundCurrency(stakePerLeg),
            totalOdds: 0,
            estimatedPayout: roundCurrency(estimatedPayout),
            impliedChance: 0,
            modelChance: selections.reduce((sum, selection) => sum + (Number(selection.trueProbability) || 0), 0) / count,
            combinations: count,
            expectedValue: roundCurrency(expectedReturn - amount),
        }
    }

    const totalOdds = selections.reduce((product, selection) => (
        product * Number(selection.currentOdds || selection.acceptedOdds || 1)
    ), 1)
    const modelChance = selections.reduce((product, selection) => (
        product * Math.max(0, Math.min(1, Number(selection.trueProbability) || 0))
    ), 1)

    if (mode === BET_MODES.SYSTEM_2) {
        const combinations = combinatorial(count, 2)
        if (count < 2 || combinations === 0) {
            return {
                mode,
                stake: amount,
                count,
                totalOdds: 0,
                estimatedPayout: 0,
                impliedChance: 0,
                modelChance: 0,
                combinations: 0,
                expectedValue: 0,
            }
        }
        const perCombo = amount / combinations
        let estimatedPayout = 0
        let expectedReturn = 0
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const a = selections[i]
                const b = selections[j]
                const comboOdds = Number(a.currentOdds || a.acceptedOdds || 1) * Number(b.currentOdds || b.acceptedOdds || 1)
                const comboProbability = (Number(a.trueProbability) || 0) * (Number(b.trueProbability) || 0)
                estimatedPayout += perCombo * comboOdds
                expectedReturn += perCombo * comboProbability * comboOdds
            }
        }
        return {
            mode,
            stake: amount,
            count,
            stakePerCombo: roundCurrency(perCombo),
            totalOdds: roundCurrency(totalOdds),
            estimatedPayout: roundCurrency(estimatedPayout),
            impliedChance: totalOdds > 0 ? 1 / totalOdds : 0,
            modelChance,
            combinations,
            expectedValue: roundCurrency(expectedReturn - amount),
        }
    }

    return {
        mode,
        stake: amount,
        count,
        totalOdds: roundCurrency(totalOdds),
        estimatedPayout: roundCurrency(amount * totalOdds),
        impliedChance: totalOdds > 0 ? 1 / totalOdds : 0,
        modelChance,
        combinations: 1,
        expectedValue: roundCurrency(amount * modelChance * totalOdds - amount),
    }
}

export function evaluateOddsPolicy(selections = [], policy = ODDS_POLICIES.ACCEPT_HIGHER) {
    const changed = selections.filter(selection => selection.oddsChanged)
    if (changed.length === 0 || policy === ODDS_POLICIES.ACCEPT_ANY) {
        return { allowed: true, needsManualAccept: false, reason: null }
    }
    if (policy === ODDS_POLICIES.NO_CHANGES) {
        return { allowed: false, needsManualAccept: true, reason: 'Odds changed. Accept the updated prices before placing.' }
    }
    const worse = changed.filter(selection => Number(selection.currentOdds) < Number(selection.acceptedOdds))
    if (worse.length > 0) {
        return { allowed: false, needsManualAccept: true, reason: 'One or more selected prices moved lower.' }
    }
    return { allowed: true, needsManualAccept: false, reason: null }
}

export function settleTicketDeterministic({ ticketId, selections = [], stake = 0, mode = BET_MODES.SINGLES, seed = '' }) {
    const rng = createRoundRng(`${seed || 'sportsbook'}:${ticketId}:${mode}:${selections.map(item => item.selectionId).join('|')}`)
    const legs = selections.map(selection => {
        const roll = rng.next()
        const won = roll < (Number(selection.trueProbability) || 0)
        return {
            selectionId: selection.selectionId,
            eventId: selection.eventId,
            marketId: selection.marketId,
            label: selection.label,
            eventLabel: selection.eventLabel,
            marketLabel: selection.marketLabel,
            odds: Number(selection.acceptedOdds || selection.currentOdds || 0),
            trueProbability: Number(selection.trueProbability) || 0,
            roll,
            won,
        }
    })
    const amount = Number(stake) || 0
    let payout = 0

    if (mode === BET_MODES.SINGLES && legs.length > 0) {
        const stakePerLeg = amount / legs.length
        payout = legs.reduce((sum, leg) => sum + (leg.won ? stakePerLeg * leg.odds : 0), 0)
    } else if (mode === BET_MODES.SYSTEM_2 && legs.length >= 2) {
        const combos = combinatorial(legs.length, 2)
        const perCombo = amount / combos
        for (let i = 0; i < legs.length; i++) {
            for (let j = i + 1; j < legs.length; j++) {
                if (legs[i].won && legs[j].won) payout += perCombo * legs[i].odds * legs[j].odds
            }
        }
    } else if (legs.length > 0 && legs.every(leg => leg.won)) {
        const totalOdds = legs.reduce((product, leg) => product * leg.odds, 1)
        payout = amount * totalOdds
    }

    return {
        legs,
        payout: roundCurrency(payout),
        profit: roundCurrency(payout - amount),
        result: payout > amount ? 'win' : payout > 0 ? 'partial' : 'loss',
    }
}

export function cashoutOffer(ticket, now = Date.now()) {
    if (!ticket || ticket.status !== 'accepted') return 0
    const quote = ticket.quote || quoteTicket(ticket)
    const ageFactor = Math.min(0.92, Math.max(0.45, (now - Number(ticket.acceptedAt || now)) / 90000 + 0.45))
    return roundCurrency(Math.max(0, quote.estimatedPayout * ageFactor * 0.78))
}
