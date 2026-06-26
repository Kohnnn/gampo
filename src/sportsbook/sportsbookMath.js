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

export const ODDS_FORMATS = {
    DECIMAL: 'decimal',
    AMERICAN: 'american',
    FRACTIONAL: 'fractional',
}

function greatestCommonDivisor(a, b) {
    let x = Math.abs(a)
    let y = Math.abs(b)
    while (y) {
        ;[x, y] = [y, x % y]
    }
    return x || 1
}

function decimalToAmerican(odds) {
    if (odds >= 2) return `+${Math.round((odds - 1) * 100)}`
    return `-${Math.round(100 / (odds - 1))}`
}

function decimalToFractional(odds) {
    const fractionalValue = odds - 1
    // Approximate to a denominator of 100 then reduce; covers standard book fractions.
    const denominator = 100
    const numerator = Math.round(fractionalValue * denominator)
    const divisor = greatestCommonDivisor(numerator, denominator)
    return `${numerator / divisor}/${denominator / divisor}`
}

export function formatOdds(decimalOdds, format = ODDS_FORMATS.DECIMAL) {
    const odds = Number(decimalOdds)
    if (!Number.isFinite(odds) || odds <= 1) return '—'
    switch (format) {
        case ODDS_FORMATS.AMERICAN:
            return decimalToAmerican(odds)
        case ODDS_FORMATS.FRACTIONAL:
            return decimalToFractional(odds)
        case ODDS_FORMATS.DECIMAL:
        default:
            return odds.toFixed(2)
    }
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

function normalizeText(value) {
    return String(value || '').trim().toLowerCase()
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null
    const direct = Number(value)
    if (Number.isFinite(direct)) return direct
    const match = String(value).match(/[+-]?\d+(?:\.\d+)?/)
    if (!match) return null
    const parsed = Number(match[0])
    return Number.isFinite(parsed) ? parsed : null
}

function firstNumber(values) {
    for (const value of values) {
        const parsed = parseNumber(value)
        if (parsed !== null) return parsed
    }
    return null
}

function normalizeMarketType({ marketType, marketLabel, marketId } = {}) {
    const value = normalizeText([marketType, marketLabel, marketId].filter(Boolean).join(' '))
    if (value.includes('btts') || (value.includes('both') && value.includes('teams') && value.includes('score'))) return 'btts'
    if (value.includes('correct') && value.includes('score')) return 'correct-score'
    if (value.includes('double') && value.includes('chance')) return 'double-chance'
    if (value.includes('dnb') || (value.includes('draw') && (value.includes('no bet') || value.includes('no-bet')))) return 'draw-no-bet'
    // odd/even must be detected before total because labels are often prefixed "Total Goals Odd/Even"
    if (value.includes('odd') && value.includes('even')) return 'odd-even'
    if (value.includes('total') || value.includes('over/under') || value.includes('over under')) return 'total'
    if (value.includes('spread') || value.includes('handicap') || value.includes('run line') || value.includes('puck line')) return 'spread'
    if (value.includes('winner') || value.includes('moneyline') || value.includes('match result') || value === '1x2' || value === 'h2h') return 'winner'
    return null
}

function selectionLabel(input) {
    return input.selectionLabel || input.label || input.selection?.label || ''
}

function scoreValue(input, side) {
    const score = input.score || input.eventScore || input.eventResult?.score || input.event?.score || {}
    return parseNumber(input[`${side}Score`] ?? score[side])
}

function selectionSide(input) {
    const explicit = normalizeText(input.selectionSide || input.side || input.outcome || input.selection?.side)
    if (['home', 'team1', 'team-1'].includes(explicit)) return 'home'
    if (['away', 'visitor', 'team2', 'team-2'].includes(explicit)) return 'away'
    if (['draw', 'tie', 'x'].includes(explicit)) return 'draw'

    const label = normalizeText(selectionLabel(input))
    const home = normalizeText(input.home || input.homeTeam || input.event?.home)
    const away = normalizeText(input.away || input.awayTeam || input.event?.away)
    if (home && (label === home || label.startsWith(`${home} `))) return 'home'
    if (away && (label === away || label.startsWith(`${away} `))) return 'away'
    if (/\bhome\b/.test(label) || label === '1' || label.startsWith('team 1')) return 'home'
    if (/\baway\b/.test(label) || /\bvisitor\b/.test(label) || label === '2' || label.startsWith('team 2')) return 'away'
    if (/\bdraw\b/.test(label) || /\btie\b/.test(label) || label === 'x') return 'draw'
    return null
}

function totalSide(input) {
    const label = normalizeText(selectionLabel(input))
    if (label.includes('over')) return 'over'
    if (label.includes('under')) return 'under'
    return null
}

function settledResult(status, reason) {
    return { status, reason }
}

function resolveWinner(input, homeScore, awayScore) {
    const side = selectionSide(input)
    if (!side) return settledResult('void', 'unsupported-selection')
    const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw'
    return settledResult(side === winner ? 'won' : 'lost', 'winner')
}

function resolveTotal(input, homeScore, awayScore) {
    const side = totalSide(input)
    const label = selectionLabel(input)
    const line = firstNumber([input.marketLine, input.line, input.selection?.line, label, input.marketLabel])
    if (!side) return settledResult('void', 'unsupported-selection')
    if (line === null) return settledResult('pending', 'line-missing')
    const total = homeScore + awayScore
    if (total === line) return settledResult('void', 'push')
    return settledResult(side === 'over' ? total > line ? 'won' : 'lost' : total < line ? 'won' : 'lost', 'total')
}

function resolveSpread(input, homeScore, awayScore) {
    const side = selectionSide(input)
    if (!side || side === 'draw') return settledResult('void', 'unsupported-selection')

    const labelLine = firstNumber([selectionLabel(input)])
    const sideLine = firstNumber([input.selectionLine, input.handicap, input.spread, input.line, input.selection?.line])
    if (sideLine !== null || labelLine !== null) {
        const line = sideLine ?? labelLine
        const selectedScore = side === 'home' ? homeScore : awayScore
        const otherScore = side === 'home' ? awayScore : homeScore
        const adjusted = selectedScore + line
        if (adjusted === otherScore) return settledResult('void', 'push')
        return settledResult(adjusted > otherScore ? 'won' : 'lost', 'spread')
    }

    const marketLine = firstNumber([input.marketLine, input.market?.line])
    if (marketLine === null) return settledResult('pending', 'line-missing')
    const homeMargin = homeScore - awayScore
    if (homeMargin === marketLine) return settledResult('void', 'push')
    if (side === 'home') return settledResult(homeMargin > marketLine ? 'won' : 'lost', 'spread')
    return settledResult(homeMargin < marketLine ? 'won' : 'lost', 'spread')
}

function yesNoSide(input) {
    const label = normalizeText(selectionLabel(input))
    if (label === 'yes' || label.startsWith('yes')) return 'yes'
    if (label === 'no' || label.startsWith('no')) return 'no'
    return null
}

function resolveBtts(input, homeScore, awayScore) {
    const side = yesNoSide(input)
    if (!side) return settledResult('void', 'unsupported-selection')
    const bothScored = homeScore > 0 && awayScore > 0
    const won = side === 'yes' ? bothScored : !bothScored
    return settledResult(won ? 'won' : 'lost', 'btts')
}

function resolveCorrectScore(input, homeScore, awayScore) {
    const label = selectionLabel(input)
    const match = String(label).match(/(\d+)\s*[-:x]\s*(\d+)/i)
    if (!match) return settledResult('pending', 'line-missing')
    const won = Number(match[1]) === homeScore && Number(match[2]) === awayScore
    return settledResult(won ? 'won' : 'lost', 'correct-score')
}

function resolveDoubleChance(input, homeScore, awayScore) {
    const label = normalizeText(selectionLabel(input)).replace(/[^0-9x]/g, '')
    const covered = {
        '1x': ['home', 'draw'],
        'x1': ['home', 'draw'],
        '12': ['home', 'away'],
        '21': ['home', 'away'],
        'x2': ['away', 'draw'],
        '2x': ['away', 'draw'],
    }[label]
    if (!covered) return settledResult('void', 'unsupported-selection')
    const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw'
    return settledResult(covered.includes(winner) ? 'won' : 'lost', 'double-chance')
}

function resolveDrawNoBet(input, homeScore, awayScore) {
    const side = selectionSide(input)
    if (!side || side === 'draw') return settledResult('void', 'unsupported-selection')
    if (homeScore === awayScore) return settledResult('void', 'draw-no-bet-push')
    const winner = homeScore > awayScore ? 'home' : 'away'
    return settledResult(side === winner ? 'won' : 'lost', 'draw-no-bet')
}

function resolveOddEven(input, homeScore, awayScore) {
    const label = normalizeText(selectionLabel(input))
    const wantsOdd = label.includes('odd')
    const wantsEven = label.includes('even')
    if (!wantsOdd && !wantsEven) return settledResult('void', 'unsupported-selection')
    const isOdd = (homeScore + awayScore) % 2 === 1
    const won = wantsOdd ? isOdd : !isOdd
    return settledResult(won ? 'won' : 'lost', 'odd-even')
}

export function resolveSelectionFromScore(input = {}) {
    const eventStatus = normalizeText(input.eventStatus || input.eventResult?.status || input.event?.status || input.status)
    if (eventStatus === 'cancelled' || eventStatus === 'canceled') return settledResult('void', 'event-cancelled')
    if (eventStatus !== 'settled') return settledResult('pending', 'event-not-settled')

    const homeScore = scoreValue(input, 'home')
    const awayScore = scoreValue(input, 'away')
    if (homeScore === null || awayScore === null) return settledResult('pending', 'score-missing')

    const marketType = normalizeMarketType(input)
    if (marketType === 'winner') return resolveWinner(input, homeScore, awayScore)
    if (marketType === 'total') return resolveTotal(input, homeScore, awayScore)
    if (marketType === 'spread') return resolveSpread(input, homeScore, awayScore)
    if (marketType === 'btts') return resolveBtts(input, homeScore, awayScore)
    if (marketType === 'correct-score') return resolveCorrectScore(input, homeScore, awayScore)
    if (marketType === 'double-chance') return resolveDoubleChance(input, homeScore, awayScore)
    if (marketType === 'draw-no-bet') return resolveDrawNoBet(input, homeScore, awayScore)
    if (marketType === 'odd-even') return resolveOddEven(input, homeScore, awayScore)
    return settledResult('void', 'unsupported-market')
}

function normalizeLegStatus(status) {
    const value = normalizeText(status)
    if (value === 'won' || value === 'win') return 'won'
    if (value === 'lost' || value === 'loss') return 'lost'
    if (value === 'void' || value === 'push' || value === 'cancelled' || value === 'canceled') return 'void'
    if (value === 'pending' || value === 'live') return 'pending'
    return null
}

function eventResultFor(eventResults, eventId) {
    if (!eventResults) return null
    if (Array.isArray(eventResults)) {
        return eventResults.find(result => result.id === eventId || result.eventId === eventId) || null
    }
    if (eventId && eventResults[eventId]) return eventResults[eventId]
    return eventResults
}

function settlementLeg(selection, eventResults) {
    const directStatus = normalizeLegStatus(selection.status)
    const eventResult = eventResultFor(eventResults, selection.eventId)
    const resolved = directStatus ? { status: directStatus } : resolveSelectionFromScore({
        ...selection,
        selectionLabel: selection.selectionLabel || selection.label,
        marketType: selection.marketType || selection.marketId,
        eventStatus: selection.eventStatus || eventResult?.status,
        homeScore: selection.homeScore ?? eventResult?.homeScore ?? eventResult?.score?.home,
        awayScore: selection.awayScore ?? eventResult?.awayScore ?? eventResult?.score?.away,
        eventResult,
    })
    return {
        selectionId: selection.selectionId,
        eventId: selection.eventId,
        marketId: selection.marketId,
        label: selection.label,
        eventLabel: selection.eventLabel,
        marketLabel: selection.marketLabel,
        odds: Number(selection.odds || selection.acceptedOdds || selection.currentOdds || selection.decimalOdds || 0),
        status: resolved.status,
        reason: resolved.reason,
    }
}

function ticketResult(payout, stake, legs) {
    if (payout > stake) return 'win'
    if (payout === 0) return 'loss'
    if (payout < stake) return 'partial'
    if (legs.length > 0 && legs.every(leg => leg.status === 'void')) return 'void'
    if (legs.some(leg => leg.status === 'lost')) return 'partial'
    return 'push'
}

function pendingSettlement(legs) {
    return { legs, payout: 0, profit: 0, result: 'pending', status: 'pending' }
}

function finalSettlement(legs, payout, amount) {
    const roundedPayout = roundCurrency(payout)
    const roundedStake = roundCurrency(amount)
    return {
        legs,
        payout: roundedPayout,
        profit: roundCurrency(roundedPayout - roundedStake),
        result: ticketResult(roundedPayout, roundedStake, legs),
        status: 'settled',
    }
}

function legOdds(leg) {
    return leg.status === 'void' ? 1 : Number(leg.odds) || 0
}

function hasPendingSystemCombo(legs) {
    for (let i = 0; i < legs.length; i++) {
        for (let j = i + 1; j < legs.length; j++) {
            const combo = [legs[i], legs[j]]
            if (combo.some(leg => leg.status === 'pending') && !combo.some(leg => leg.status === 'lost')) return true
        }
    }
    return false
}

export function settleTicketByEventResults({ selections = [], stake = 0, mode = BET_MODES.SINGLES, eventResults = null }) {
    const legs = selections.map(selection => settlementLeg(selection, eventResults))
    const amount = Math.max(0, Number(stake) || 0)

    if (mode === BET_MODES.SINGLES) {
        if (legs.some(leg => leg.status === 'pending')) return pendingSettlement(legs)
        const stakePerLeg = legs.length > 0 ? amount / legs.length : 0
        const payout = legs.reduce((sum, leg) => {
            if (leg.status === 'won') return sum + stakePerLeg * legOdds(leg)
            if (leg.status === 'void') return sum + stakePerLeg
            return sum
        }, 0)
        return finalSettlement(legs, payout, amount)
    }

    if (mode === BET_MODES.SYSTEM_2) {
        if (legs.length < 2) return finalSettlement(legs, 0, amount)
        if (hasPendingSystemCombo(legs)) return pendingSettlement(legs)
        const combinations = combinatorial(legs.length, 2)
        const stakePerCombo = amount / combinations
        let payout = 0
        for (let i = 0; i < legs.length; i++) {
            for (let j = i + 1; j < legs.length; j++) {
                if (legs[i].status !== 'lost' && legs[j].status !== 'lost') {
                    const settledLegs = [legs[i], legs[j]].filter(leg => leg.status === 'won').length
                    payout += stakePerCombo * legOdds(legs[i]) * legOdds(legs[j]) / Math.max(1, settledLegs)
                }
            }
        }
        return finalSettlement(legs, payout, amount)
    }

    if (legs.length === 0) return finalSettlement(legs, 0, amount)
    if (legs.some(leg => leg.status === 'pending')) return pendingSettlement(legs)
    if (legs.some(leg => leg.status === 'lost')) return finalSettlement(legs, 0, amount)
    const payout = amount * legs.reduce((product, leg) => product * legOdds(leg), 1)
    return finalSettlement(legs, payout, amount)
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
    if (!ticket || (ticket.status !== 'accepted' && ticket.status !== 'active')) return 0
    const legs = ticket.legs?.length ? ticket.legs : ticket.selections || []
    if (legs.some(leg => leg.status === 'lost')) return 0
    const quote = ticket.quote || quoteTicket(ticket)
    const ageFactor = Math.min(0.92, Math.max(0.45, (now - Number(ticket.acceptedAt || now)) / 90000 + 0.45))
    return roundCurrency(Math.max(0, quote.estimatedPayout * ageFactor * 0.78))
}
