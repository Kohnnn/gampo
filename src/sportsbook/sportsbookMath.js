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

function selectionId(selection, index) {
    return String(selection.selectionId || selection.id || index)
}

function acceptedPrice(selection, fallback = 0) {
    const accepted = Number(selection.acceptedOdds)
    if (Number.isFinite(accepted) && accepted > 1) return accepted
    const offered = Number(selection.currentOdds ?? selection.decimalOdds ?? selection.odds)
    return Number.isFinite(offered) && offered > 1 ? offered : fallback
}

function enumerateCombinations(selections, stake, mode) {
    const amount = Math.max(0, Number(stake) || 0)
    let indexGroups = []
    if (mode === BET_MODES.SINGLES) indexGroups = selections.map((_, index) => [index])
    if (mode === BET_MODES.MULTI && selections.length >= 2) indexGroups = [selections.map((_, index) => index)]
    if (mode === BET_MODES.SYSTEM_2 && selections.length >= 2) {
        for (let i = 0; i < selections.length; i++) {
            for (let j = i + 1; j < selections.length; j++) indexGroups.push([i, j])
        }
    }
    const rawStake = indexGroups.length > 0 ? amount / indexGroups.length : 0
    return indexGroups.map(indexes => {
        const members = indexes.map(index => selections[index])
        const selectionIds = indexes.map(index => selectionId(selections[index], index))
        return {
            id: `${mode}:${selectionIds.join('+')}`,
            mode,
            selectionIds,
            indexes,
            members,
            rawStake,
        }
    })
}

function emptyQuote(mode, amount, count) {
    return {
        mode,
        stake: amount,
        count,
        totalOdds: 0,
        estimatedPayout: 0,
        impliedChance: 0,
        modelChance: 0,
        combinations: 0,
        combinationDetails: [],
        expectedValue: 0,
    }
}

export function quoteTicket({ selections = [], stake = 0, mode = BET_MODES.SINGLES }) {
    const amount = Math.max(0, Number(stake) || 0)
    const count = selections.length
    const combinations = enumerateCombinations(selections, amount, mode)
    if (amount <= 0 || combinations.length === 0) return emptyQuote(mode, amount, count)

    const combinationDetails = combinations.map(combination => {
        const rawOddsProduct = combination.members.reduce((product, selection) => product * acceptedPrice(selection, 1), 1)
        const rawEstimatedReturn = combination.rawStake * rawOddsProduct
        return {
            id: combination.id,
            mode,
            selectionIds: combination.selectionIds,
            stake: roundCurrency(combination.rawStake),
            oddsProduct: roundCurrency(rawOddsProduct),
            estimatedReturn: roundCurrency(rawEstimatedReturn),
            rawStake: combination.rawStake,
            rawOddsProduct,
            rawEstimatedReturn,
        }
    })
    const totalOddsRaw = selections.reduce((product, selection) => product * acceptedPrice(selection, 1), 1)
    const modelChance = mode === BET_MODES.SINGLES
        ? selections.reduce((sum, selection) => sum + (Number(selection.trueProbability) || 0), 0) / count
        : selections.reduce((product, selection) => product * Math.max(0, Math.min(1, Number(selection.trueProbability) || 0)), 1)
    const expectedReturn = combinations.reduce((sum, combination) => {
        const probability = combination.members.reduce((product, selection) => product * (Number(selection.trueProbability) || 0), 1)
        const odds = combination.members.reduce((product, selection) => product * acceptedPrice(selection, 1), 1)
        return sum + combination.rawStake * probability * odds
    }, 0)
    const estimatedPayout = roundCurrency(combinationDetails.reduce((sum, detail) => sum + detail.rawEstimatedReturn, 0))
    const totalOdds = mode === BET_MODES.SINGLES ? 0 : roundCurrency(totalOddsRaw)

    return {
        mode,
        stake: amount,
        count,
        ...(mode === BET_MODES.SINGLES ? { stakePerLeg: roundCurrency(combinations[0].rawStake) } : {}),
        ...(mode === BET_MODES.SYSTEM_2 ? { stakePerCombo: roundCurrency(combinations[0].rawStake) } : {}),
        totalOdds,
        estimatedPayout,
        impliedChance: totalOdds > 0 ? 1 / totalOddsRaw : 0,
        modelChance,
        combinations: combinationDetails.length,
        combinationDetails,
        expectedValue: roundCurrency(expectedReturn - amount),
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
    // result + btts combo must be detected before plain btts/winner because its label contains both cues
    if (value.includes('result') && (value.includes('btts') || (value.includes('both') && value.includes('teams') && value.includes('score')))) return 'result-btts'
    if (value.includes('btts') || (value.includes('both') && value.includes('teams') && value.includes('score'))) return 'btts'
    if (value.includes('correct') && value.includes('score')) return 'correct-score'
    if (value.includes('double') && value.includes('chance')) return 'double-chance'
    if (value.includes('dnb') || (value.includes('draw') && (value.includes('no bet') || value.includes('no-bet')))) return 'draw-no-bet'
    if (value.includes('clean') && value.includes('sheet')) return 'clean-sheet'
    if ((value.includes('win') && value.includes('nil')) || value.includes('win to zero')) return 'win-to-nil'
    // odd/even must be detected before total because labels are often prefixed "Total Goals Odd/Even"
    if (value.includes('odd') && value.includes('even')) return 'odd-even'
    if (value.includes('total') && (value.includes('home') || value.includes('away') || value.includes('team'))) return 'team-total'
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

function doubleChanceCover(input) {
    const raw = normalizeText(selectionLabel(input))
    const hasHome = /\bhome\b/.test(raw) || /\b1\b/.test(raw)
    const hasAway = /\baway\b/.test(raw) || /\b2\b/.test(raw)
    const hasDraw = /\bdraw\b/.test(raw) || /\btie\b/.test(raw) || /x/.test(raw)
    if (raw.includes('or') || (hasHome && hasAway) || (hasHome && hasDraw) || (hasAway && hasDraw)) {
        const cover = []
        if (hasHome) cover.push('home')
        if (hasAway) cover.push('away')
        if (hasDraw) cover.push('draw')
        if (cover.length >= 2) return cover
    }
    const compact = raw.replace(/[^0-9x]/g, '')
    return {
        '1x': ['home', 'draw'],
        'x1': ['home', 'draw'],
        '12': ['home', 'away'],
        '21': ['home', 'away'],
        'x2': ['away', 'draw'],
        '2x': ['away', 'draw'],
    }[compact] || null
}

function resolveDoubleChance(input, homeScore, awayScore) {
    const covered = doubleChanceCover(input)
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

function resolveCleanSheet(input, homeScore, awayScore) {
    const side = selectionSide(input)
    if (!side || side === 'draw') return settledResult('void', 'unsupported-selection')
    const label = normalizeText(selectionLabel(input))
    const wantsNo = /\bno\b/.test(label)
    const concededAgainst = side === 'home' ? awayScore : homeScore
    const keptCleanSheet = concededAgainst === 0
    const won = wantsNo ? !keptCleanSheet : keptCleanSheet
    return settledResult(won ? 'won' : 'lost', 'clean-sheet')
}

function resolveWinToNil(input, homeScore, awayScore) {
    const side = selectionSide(input)
    if (!side || side === 'draw') return settledResult('void', 'unsupported-selection')
    const wonMatch = side === 'home' ? homeScore > awayScore : awayScore > homeScore
    const concededAgainst = side === 'home' ? awayScore : homeScore
    const won = wonMatch && concededAgainst === 0
    return settledResult(won ? 'won' : 'lost', 'win-to-nil')
}

function resolveTeamTotal(input, homeScore, awayScore) {
    const side = selectionSide(input)
    const overUnder = totalSide(input)
    if (!side || side === 'draw') return settledResult('void', 'unsupported-selection')
    if (!overUnder) return settledResult('void', 'unsupported-selection')
    const line = firstNumber([input.marketLine, input.line, input.selection?.line, selectionLabel(input), input.marketLabel])
    if (line === null) return settledResult('pending', 'line-missing')
    const teamScore = side === 'home' ? homeScore : awayScore
    if (teamScore === line) return settledResult('void', 'push')
    return settledResult(overUnder === 'over' ? teamScore > line ? 'won' : 'lost' : teamScore < line ? 'won' : 'lost', 'team-total')
}

function resolveResultBtts(input, homeScore, awayScore) {
    const label = normalizeText(selectionLabel(input))
    const resultPart = /\bhome\b/.test(label) || label.startsWith('1') ? 'home'
        : /\baway\b/.test(label) || label.startsWith('2') ? 'away'
            : /\bdraw\b/.test(label) || /\btie\b/.test(label) ? 'draw' : null
    const bttsPart = label.includes('yes') ? 'yes' : label.includes('no') ? 'no' : null
    if (!resultPart || !bttsPart) return settledResult('void', 'unsupported-selection')
    const winner = homeScore > awayScore ? 'home' : awayScore > homeScore ? 'away' : 'draw'
    const bothScored = homeScore > 0 && awayScore > 0
    const resultHit = resultPart === winner
    const bttsHit = bttsPart === 'yes' ? bothScored : !bothScored
    return settledResult(resultHit && bttsHit ? 'won' : 'lost', 'result-btts')
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
    if (marketType === 'result-btts') return resolveResultBtts(input, homeScore, awayScore)
    if (marketType === 'team-total') return resolveTeamTotal(input, homeScore, awayScore)
    if (marketType === 'total') return resolveTotal(input, homeScore, awayScore)
    if (marketType === 'spread') return resolveSpread(input, homeScore, awayScore)
    if (marketType === 'btts') return resolveBtts(input, homeScore, awayScore)
    if (marketType === 'correct-score') return resolveCorrectScore(input, homeScore, awayScore)
    if (marketType === 'double-chance') return resolveDoubleChance(input, homeScore, awayScore)
    if (marketType === 'draw-no-bet') return resolveDrawNoBet(input, homeScore, awayScore)
    if (marketType === 'clean-sheet') return resolveCleanSheet(input, homeScore, awayScore)
    if (marketType === 'win-to-nil') return resolveWinToNil(input, homeScore, awayScore)
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

function eventResultFor(eventResults, selection) {
    if (!eventResults) return null
    const canonicalEventId = String(selection.canonicalEventId || '').trim()
    const eventId = String(selection.eventId || '').trim()
    if (Array.isArray(eventResults)) {
        if (canonicalEventId) return eventResults.find(result => result.canonicalEventId === canonicalEventId) || null
        return eventResults.find(result => result.id === eventId || result.eventId === eventId) || null
    }
    if (canonicalEventId) {
        if (eventResults[canonicalEventId]) return eventResults[canonicalEventId]
        if (eventResults.canonicalEventId === canonicalEventId) return eventResults
        return null
    }
    if (eventId && eventResults[eventId]) return eventResults[eventId]
    return eventResults.id === eventId || eventResults.eventId === eventId ? eventResults : null
}

function settlementLeg(selection, eventResults) {
    const directStatus = normalizeLegStatus(selection.status)
    const eventResult = eventResultFor(eventResults, selection)
    const marketType = normalizeMarketType(selection)
    const eventStatus = selection.eventStatus || eventResult?.status
    const cancelled = ['cancelled', 'canceled'].includes(normalizeText(eventStatus))
    const resolved = directStatus ? { status: directStatus, reason: selection.reason } : cancelled
        ? settledResult('void', 'event-cancelled')
        : !['winner', 'total', 'spread'].includes(marketType)
            ? settledResult('pending', 'unsupported-market')
            : resolveSelectionFromScore({
                ...selection,
                selectionLabel: selection.selectionLabel || selection.label,
                marketType,
                eventStatus,
                homeScore: selection.homeScore ?? eventResult?.homeScore ?? eventResult?.score?.home,
                awayScore: selection.awayScore ?? eventResult?.awayScore ?? eventResult?.score?.away,
                eventResult,
            })
    return {
        selectionId: selection.selectionId,
        canonicalEventId: selection.canonicalEventId,
        eventId: selection.eventId,
        marketId: selection.marketId,
        label: selection.label,
        eventLabel: selection.eventLabel,
        marketLabel: selection.marketLabel,
        odds: acceptedPrice(selection),
        status: resolved.status,
        reason: resolved.reason,
    }
}

function classifyTicket(combinationDetails, payout, stake) {
    if (combinationDetails.some(detail => detail.status === 'pending')) return 'pending'
    if (combinationDetails.length > 0 && combinationDetails.every(detail => detail.legStatuses.every(status => status === 'void'))) return 'full-void'
    const roundedPayout = roundCurrency(payout)
    const roundedStake = roundCurrency(stake)
    if (roundedPayout === 0) return 'loss'
    if (roundedPayout === roundedStake) return 'push'
    if (roundedPayout > roundedStake) return 'win'
    return 'partial'
}

export function settleTicketByEventResults({ selections = [], stake = 0, mode = BET_MODES.SINGLES, eventResults = null }) {
    const amount = Math.max(0, Number(stake) || 0)
    const legs = selections.map(selection => settlementLeg(selection, eventResults))
    const combinations = enumerateCombinations(legs, amount, mode)
    const combinationDetails = combinations.map(combination => {
        const legStatuses = combination.members.map(leg => leg.status)
        const status = legStatuses.includes('lost') ? 'lost' : legStatuses.includes('pending') ? 'pending' : 'settled'
        const rawSettledReturn = status === 'settled'
            ? combination.rawStake * combination.members.reduce((product, leg) => product * (leg.status === 'void' ? 1 : leg.odds), 1)
            : 0
        return {
            id: combination.id,
            mode,
            selectionIds: combination.selectionIds,
            legStatuses,
            status,
            stake: roundCurrency(combination.rawStake),
            settledReturn: roundCurrency(rawSettledReturn),
            rawStake: combination.rawStake,
            rawSettledReturn,
        }
    })
    const rawPayout = combinationDetails.reduce((sum, detail) => sum + detail.rawSettledReturn, 0)
    const result = classifyTicket(combinationDetails, rawPayout, amount)
    const pending = result === 'pending'
    const payout = pending ? 0 : roundCurrency(rawPayout)
    return {
        legs,
        combinations: combinationDetails.length,
        combinationDetails,
        payout,
        profit: pending ? 0 : roundCurrency(payout - roundCurrency(amount)),
        result,
        status: pending ? 'pending' : 'settled',
    }
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
    const payout = enumerateCombinations(legs, amount, mode).reduce((sum, combination) => {
        if (!combination.members.every(leg => leg.won)) return sum
        return sum + combination.rawStake * combination.members.reduce((product, leg) => product * leg.odds, 1)
    }, 0)

    return {
        legs,
        payout: roundCurrency(payout),
        profit: roundCurrency(payout - amount),
        result: payout > amount ? 'win' : payout > 0 ? 'partial' : 'loss',
    }
}

export const SIMULATED_CASHOUT_HAIRCUT = 0.78

const CASHOUT_REASONS = new Set([
    'ticket-ineligible', 'ticket-terminal', 'leg-lost', 'unsupported-leg', 'probability-unmatched',
    'probability-conflict', 'probability-stale', 'probability-malformed', 'probability-incomplete',
    'non-positive-value', 'valuation-mismatch',
])

function unavailableCashout(reason) {
    return {
        available: false,
        amount: null,
        currency: 'GC',
        label: 'Simulated cash-out',
        reason: CASHOUT_REASONS.has(reason) ? reason : 'ticket-ineligible',
        fairCurrentValue: null,
        haircut: SIMULATED_CASHOUT_HAIRCUT,
        inputObservedAt: null,
        sources: [],
        legProbabilities: [],
        combinationValues: [],
        observationFingerprint: null,
        valuationFingerprint: null,
    }
}

function canonicalJsonValue(value, seen = new WeakSet()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError('non-finite')
        return value
    }
    if (!value || typeof value !== 'object' || seen.has(value)) throw new TypeError('non-json')
    if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError('custom-array')
        seen.add(value)
        const result = value.map(item => canonicalJsonValue(item, seen))
        seen.delete(value)
        return result
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError('custom-object')
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (Object.values(descriptors).some(descriptor => !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined)) throw new TypeError('accessor')
    seen.add(value)
    const result = {}
    Object.keys(descriptors).sort().forEach(key => { result[key] = canonicalJsonValue(descriptors[key].value, seen) })
    seen.delete(value)
    return result
}

function canonicalSourceContext(value) {
    return JSON.stringify(canonicalJsonValue(value))
}

function cashoutLine(value, marketId) {
    if (marketId === 'winner') return null
    return typeof value === 'number' && Number.isFinite(value) ? value : NaN
}

function sameCashoutLine(left, right, marketId) {
    if (marketId === 'winner') return true
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    return marketId === 'spread' ? Math.abs(left) === Math.abs(right) : left === right
}

function acceptedCashoutShape(ticket) {
    if (!ticket || typeof ticket !== 'object' || !Object.values(BET_MODES).includes(ticket.mode) || !Number.isFinite(ticket.stake) || ticket.stake <= 0) return null
    if (!nonEmptyCashout(ticket.id) || !Array.isArray(ticket.selections) || !Array.isArray(ticket.legs) || !Array.isArray(ticket.combinationDetails) || !Array.isArray(ticket.quote?.combinationDetails)) return null
    const selections = new Map()
    for (const selection of ticket.selections) {
        if (!nonEmptyCashout(selection?.selectionId) || selections.has(selection.selectionId) || !Number.isFinite(selection.acceptedOdds) || selection.acceptedOdds <= 1) return null
        selections.set(selection.selectionId, selection)
    }
    if (ticket.legs.length !== selections.size) return null
    const legs = new Map()
    for (const leg of ticket.legs) {
        if (!nonEmptyCashout(leg?.selectionId) || legs.has(leg.selectionId) || !selections.has(leg.selectionId)) return null
        legs.set(leg.selectionId, leg)
    }
    if (ticket.combinationDetails.length < 1 || ticket.combinationDetails.length !== ticket.quote.combinationDetails.length) return null
    for (let index = 0; index < ticket.combinationDetails.length; index++) {
        const detail = ticket.combinationDetails[index]
        const quoted = ticket.quote.combinationDetails[index]
        if (!detail || !quoted || detail.id !== quoted.id || detail.mode !== quoted.mode || detail.mode !== ticket.mode
            || JSON.stringify(detail.selectionIds) !== JSON.stringify(quoted.selectionIds)
            || detail.rawStake !== quoted.rawStake || !Number.isFinite(detail.rawStake) || detail.rawStake <= 0
            || !Array.isArray(detail.selectionIds) || detail.selectionIds.length < 1 || detail.selectionIds.some(id => !selections.has(id))) return null
    }
    return { selections, legs }
}

function nonEmptyCashout(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function eventForCashout(events, canonicalEventId) {
    return Array.isArray(events) ? events.filter(event => event?.canonicalEventId === canonicalEventId) : []
}

function outcomeSetFor(marketId, outcomes) {
    const sorted = [...outcomes].sort()
    if (marketId === 'winner') {
        if (JSON.stringify(sorted) === JSON.stringify(['away', 'home'])) return true
        return JSON.stringify(sorted) === JSON.stringify(['away', 'draw', 'home'])
    }
    if (marketId === 'total') return JSON.stringify(sorted) === JSON.stringify(['over', 'under'])
    if (marketId === 'spread') return JSON.stringify(sorted) === JSON.stringify(['away', 'home'])
    return false
}

function deriveCashoutCohort(selection, events) {
    let sourceContext
    try {
        sourceContext = canonicalSourceContext(selection.sourceContext)
    } catch {
        return { ok: false, reason: 'probability-malformed' }
    }
    const marketId = selection.marketId
    const line = cashoutLine(selection.line, marketId)
    if (!['winner', 'total', 'spread'].includes(marketId) || !nonEmptyCashout(selection.canonicalEventId)
        || !nonEmptyCashout(selection.bookmaker) || !nonEmptyCashout(selection.provider)
        || (marketId !== 'winner' && !Number.isFinite(line))) return { ok: false, reason: 'probability-malformed' }
    const observations = eventForCashout(events, selection.canonicalEventId).flatMap(event => Array.isArray(event.offers) ? event.offers : [])
    const identityMatches = []
    let malformedMatch = false
    for (const offer of observations) {
        if (offer?.canonicalEventId !== selection.canonicalEventId || offer?.marketId !== marketId
            || !sameCashoutLine(cashoutLine(offer?.line, marketId), line, marketId)) continue
        if (offer?.ineligibilityReason === 'model-estimate' || offer?.bookmaker === null) malformedMatch = true
        if (offer?.bookmaker !== selection.bookmaker || offer?.provider !== selection.provider) continue
        let offerContext
        try {
            offerContext = canonicalSourceContext(offer?.sourceContext)
        } catch {
            malformedMatch = true
            continue
        }
        if (offerContext === sourceContext) identityMatches.push({ offer, offerContext })
    }
    if (identityMatches.length === 0) return { ok: false, reason: malformedMatch ? 'probability-malformed' : 'probability-unmatched' }
    const outcomes = identityMatches.map(({ offer }) => offer.outcome)
    if (new Set(outcomes).size !== outcomes.length) return { ok: false, reason: 'probability-conflict' }
    if (identityMatches.some(({ offer }) => offer.freshness !== 'current')) return { ok: false, reason: 'probability-stale' }
    if (identityMatches.some(({ offer, offerContext }) => !offerContext || !nonEmptyCashout(offer.outcome) || !Number.isFinite(offer.decimalOdds) || offer.decimalOdds <= 1
        || !nonEmptyCashout(offer.observedAt) || offer.submittable !== true || offer.ineligibilityReason !== null || offer.suspended !== false)) return { ok: false, reason: 'probability-malformed' }
    if (!outcomeSetFor(marketId, outcomes)) return { ok: false, reason: malformedMatch ? 'probability-malformed' : 'probability-incomplete' }
    const sorted = identityMatches.map(({ offer }) => offer).sort((left, right) => left.outcome.localeCompare(right.outcome))
    const probabilities = deVigProbabilities(sorted.map(offer => offer.decimalOdds))
    const selectedIndex = sorted.findIndex(offer => offer.outcome === selection.outcome)
    if (selectedIndex < 0) return { ok: false, reason: 'probability-incomplete' }
    return { ok: true, sorted, probability: probabilities[selectedIndex], sourceContext, line }
}

export function deriveCashoutProbabilityInputs({ ticket, events } = {}) {
    const shape = acceptedCashoutShape(ticket)
    if (!shape) return { ok: false, reason: 'ticket-ineligible' }
    const cohorts = []
    for (const [selectionId, leg] of shape.legs) {
        if (normalizeLegStatus(leg.status) !== 'pending') continue
        const selection = shape.selections.get(selectionId)
        const cohort = deriveCashoutCohort(selection, events)
        if (!cohort.ok) return cohort
        cohorts.push({ selectionId, selection, ...cohort })
    }
    cohorts.sort((left, right) => left.selectionId.localeCompare(right.selectionId))
    const observationFingerprint = JSON.stringify([
        'cashout-observation-v1',
        ...cohorts.map(cohort => [
            cohort.selectionId, cohort.selection.canonicalEventId, cohort.selection.marketId, cohort.line,
            cohort.selection.bookmaker, cohort.selection.provider, cohort.sourceContext,
            ...cohort.sorted.map(offer => [offer.outcome, offer.decimalOdds, offer.observedAt, offer.freshness, offer.submittable, offer.ineligibilityReason, offer.suspended]),
        ]),
    ])
    const observedAt = cohorts.flatMap(cohort => cohort.sorted.map(offer => offer.observedAt)).sort()
    return {
        ok: true,
        cohorts,
        observationFingerprint,
        inputObservedAt: observedAt.at(-1) || null,
        sources: [...new Set(cohorts.map(cohort => `${cohort.selection.bookmaker}:${cohort.selection.provider}`))].sort(),
    }
}

function cashoutValuationFingerprint(ticket, valuation) {
    const legs = ticket.selections.map(selection => {
        const leg = ticket.legs.find(item => item.selectionId === selection.selectionId)
        const status = normalizeLegStatus(leg?.status)
        return [selection.selectionId, selection.canonicalEventId, selection.marketId, cashoutLine(selection.line, selection.marketId), selection.acceptedOdds, status, status === 'pending' ? 'pending' : leg?.reason ?? null]
    }).sort((left, right) => left[0].localeCompare(right[0]))
    return JSON.stringify([
        'cashout-valuation-v1', ticket.id, ticket.status, ticket.mode, ticket.stake,
        ...ticket.combinationDetails.map(detail => [detail.id, detail.mode, detail.selectionIds, detail.rawStake]),
        ...legs,
        valuation.observationFingerprint, SIMULATED_CASHOUT_HAIRCUT, valuation.fairCurrentValue, valuation.amount,
    ])
}

function expectedCashoutValuationStructure(ticket, valuation) {
    let observation
    try {
        observation = JSON.parse(valuation.observationFingerprint)
    } catch {
        return null
    }
    if (!Array.isArray(observation) || observation[0] !== 'cashout-observation-v1') return null
    const probabilities = []
    const probabilityBySelectionId = new Map()
    const sources = new Set()
    const observedAt = []
    for (const cohort of observation.slice(1)) {
        if (!Array.isArray(cohort) || cohort.length < 9) return null
        const [selectionId, canonicalEventId, marketId, line, bookmaker, provider, sourceContext, ...members] = cohort
        const selection = ticket.selections.find(item => item.selectionId === selectionId)
        const leg = ticket.legs.find(item => item.selectionId === selectionId)
        if (!selection || normalizeLegStatus(leg?.status) !== 'pending' || selection.canonicalEventId !== canonicalEventId
            || selection.marketId !== marketId || cashoutLine(selection.line, marketId) !== line
            || selection.bookmaker !== bookmaker || selection.provider !== provider) return null
        try {
            if (canonicalSourceContext(selection.sourceContext) !== sourceContext) return null
        } catch {
            return null
        }
        if (!outcomeSetFor(marketId, members.map(member => member?.[0])) || members.some(member => !Array.isArray(member) || member.length !== 7
            || !nonEmptyCashout(member[0]) || !Number.isFinite(member[1]) || member[1] <= 1 || !nonEmptyCashout(member[2])
            || member[3] !== 'current' || member[4] !== true || member[5] !== null || member[6] !== false)) return null
        const selectedIndex = members.findIndex(member => member[0] === selection.outcome)
        if (selectedIndex < 0) return null
        const probability = deVigProbabilities(members.map(member => member[1]))[selectedIndex]
        const latestObservedAt = members.map(member => member[2]).sort().at(-1)
        const record = { selectionId, probability, bookmaker, provider, observedAt: latestObservedAt }
        probabilities.push(record)
        probabilityBySelectionId.set(selectionId, probability)
        sources.add(`${bookmaker}:${provider}`)
        observedAt.push(...members.map(member => member[2]))
    }
    probabilities.sort((left, right) => left.selectionId.localeCompare(right.selectionId))
    const combinations = ticket.combinationDetails.map(detail => ({
        id: detail.id,
        rawStake: detail.rawStake,
        rawCurrentValue: detail.selectionIds.reduce((value, selectionId) => {
            const selection = ticket.selections.find(item => item.selectionId === selectionId)
            const leg = ticket.legs.find(item => item.selectionId === selectionId)
            const status = normalizeLegStatus(leg?.status)
            const factor = status === 'void' ? 1 : status === 'won' ? selection?.acceptedOdds : selection?.acceptedOdds * probabilityBySelectionId.get(selectionId)
            return value * factor
        }, detail.rawStake),
    }))
    if (combinations.some(item => !Number.isFinite(item.rawCurrentValue))) return null
    return {
        sources: [...sources].sort(),
        legProbabilities: probabilities,
        combinationValues: combinations,
        inputObservedAt: observedAt.sort().at(-1) || null,
        fairCurrentValue: combinations.reduce((sum, item) => sum + item.rawCurrentValue, 0),
    }
}

export function isValidSimulatedCashoutValuation(ticket, valuation) {
    if (!acceptedCashoutShape(ticket) || !valuation || valuation.available !== true || valuation.currency !== 'GC'
        || valuation.label !== 'Simulated cash-out' || valuation.reason !== null || valuation.haircut !== SIMULATED_CASHOUT_HAIRCUT
        || !Number.isFinite(valuation.amount) || valuation.amount <= 0 || !Number.isFinite(valuation.fairCurrentValue) || valuation.fairCurrentValue <= 0
        || !nonEmptyCashout(valuation.inputObservedAt) || !Array.isArray(valuation.sources) || valuation.sources.length < 1
        || JSON.stringify(valuation.sources) !== JSON.stringify([...new Set(valuation.sources)].sort())
        || !Array.isArray(valuation.legProbabilities) || !Array.isArray(valuation.combinationValues)
        || !nonEmptyCashout(valuation.observationFingerprint) || !nonEmptyCashout(valuation.valuationFingerprint)) return false
    const probabilityIds = valuation.legProbabilities.map(item => item?.selectionId)
    if (JSON.stringify(probabilityIds) !== JSON.stringify([...probabilityIds].sort()) || new Set(probabilityIds).size !== probabilityIds.length
        || valuation.legProbabilities.some(item => !nonEmptyCashout(item?.selectionId) || !Number.isFinite(item.probability) || item.probability <= 0 || item.probability >= 1
            || !nonEmptyCashout(item.bookmaker) || !nonEmptyCashout(item.provider) || !nonEmptyCashout(item.observedAt))) return false
    if (valuation.combinationValues.length !== ticket.combinationDetails.length || valuation.combinationValues.some((item, index) => {
        const expected = ticket.combinationDetails[index]
        return item?.id !== expected.id || item.rawStake !== expected.rawStake || !Number.isFinite(item.rawCurrentValue) || item.rawCurrentValue <= 0
    })) return false
    const expected = expectedCashoutValuationStructure(ticket, valuation)
    if (!expected || JSON.stringify(valuation.sources) !== JSON.stringify(expected.sources)
        || JSON.stringify(valuation.legProbabilities) !== JSON.stringify(expected.legProbabilities)
        || JSON.stringify(valuation.combinationValues) !== JSON.stringify(expected.combinationValues)
        || valuation.inputObservedAt !== expected.inputObservedAt || valuation.fairCurrentValue !== expected.fairCurrentValue
        || roundCurrency(expected.fairCurrentValue * SIMULATED_CASHOUT_HAIRCUT) !== valuation.amount) return false
    return cashoutValuationFingerprint(ticket, valuation) === valuation.valuationFingerprint
}

export function valueSimulatedCashout({ ticket, events } = {}) {
    const shape = acceptedCashoutShape(ticket)
    if (!shape) return unavailableCashout('ticket-ineligible')
    if (ticket.status !== 'active' && ticket.status !== 'accepted') return unavailableCashout('ticket-terminal')
    const statuses = [...shape.legs.values()].map(leg => normalizeLegStatus(leg.status))
    if (statuses.includes('lost')) return unavailableCashout('leg-lost')
    if (statuses.some(status => !['won', 'void', 'pending'].includes(status))) return unavailableCashout('unsupported-leg')
    const inputs = deriveCashoutProbabilityInputs({ ticket, events })
    if (!inputs.ok) return unavailableCashout(inputs.reason)
    const probabilities = new Map(inputs.cohorts.map(cohort => [cohort.selectionId, cohort]))
    const combinationValues = ticket.combinationDetails.map(detail => {
        const rawCurrentValue = detail.selectionIds.reduce((value, id) => {
            const selection = shape.selections.get(id)
            const status = normalizeLegStatus(shape.legs.get(id).status)
            const factor = status === 'void' ? 1 : status === 'won' ? selection.acceptedOdds : selection.acceptedOdds * probabilities.get(id).probability
            return value * factor
        }, detail.rawStake)
        return { id: detail.id, rawStake: detail.rawStake, rawCurrentValue }
    })
    const fairCurrentValue = combinationValues.reduce((sum, detail) => sum + detail.rawCurrentValue, 0)
    const amount = roundCurrency(fairCurrentValue * SIMULATED_CASHOUT_HAIRCUT)
    if (!Number.isFinite(fairCurrentValue) || fairCurrentValue <= 0 || !Number.isFinite(amount) || amount <= 0) return unavailableCashout('non-positive-value')
    const valuation = {
        available: true,
        amount,
        currency: 'GC',
        label: 'Simulated cash-out',
        reason: null,
        fairCurrentValue,
        haircut: SIMULATED_CASHOUT_HAIRCUT,
        inputObservedAt: inputs.inputObservedAt,
        sources: inputs.sources,
        legProbabilities: inputs.cohorts.map(cohort => ({ selectionId: cohort.selectionId, probability: cohort.probability, bookmaker: cohort.selection.bookmaker, provider: cohort.selection.provider, observedAt: cohort.sorted.map(offer => offer.observedAt).sort().at(-1) })),
        combinationValues,
        observationFingerprint: inputs.observationFingerprint,
        valuationFingerprint: null,
    }
    valuation.valuationFingerprint = cashoutValuationFingerprint(ticket, valuation)
    return valuation
}
