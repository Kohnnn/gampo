import {
    BET_MODES,
    deVigProbabilities,
    fairDecimalOdds,
    impliedProbability,
    overround,
    quoteTicket,
    roundCurrency,
    vig,
} from './sportsbookMath'

/**
 * @typedef {'beginner'|'intermediate'|'advanced'} EducationTier
 *
 * @typedef {Object} EducationInsight
 * @property {string} id
 * @property {EducationTier} tier
 * @property {string} title
 * @property {string} body
 * @property {string} [metricLabel]
 * @property {string} [metricValue]
 * @property {'neutral'|'positive'|'warning'|'danger'} [tone]
 *
 * @typedef {Object} SelectionAnalysis
 * @property {'selection'} type
 * @property {string} title
 * @property {Array<{label:string,value:string,tone?:string}>} metrics
 * @property {EducationInsight[]} insights
 *
 * @typedef {Object} MarketAnalysis
 * @property {'market'} type
 * @property {string} title
 * @property {Array<{label:string,value:string,tone?:string}>} metrics
 * @property {Array<{label:string,decimalOdds:number,impliedProbability:number,noVigProbability:number,fairOdds:number}>} rows
 * @property {EducationInsight[]} insights
 *
 * @typedef {Object} TicketAnalysis
 * @property {'ticket'} type
 * @property {string} title
 * @property {Array<{label:string,value:string,tone?:string}>} metrics
 * @property {EducationInsight[]} insights
 *
 * @typedef {Object} SettlementAnalysis
 * @property {'settlement'} type
 * @property {string} title
 * @property {Array<{label:string,value:string,tone?:string}>} metrics
 * @property {Array<{label:string,acceptedOdds:number,probability:number,roll:number,result:string,returnRole:string}>} [legRows]
 * @property {EducationInsight[]} insights
 */

export const EDUCATION_SECTIONS = [
    { tier: 'beginner', label: 'Basics' },
    { tier: 'intermediate', label: 'Analysis' },
    { tier: 'advanced', label: 'Sharp Notes' },
]

export function formatPercent(value, digits = 1) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '0.0%'
    return `${(numeric * 100).toFixed(digits)}%`
}

function decimal(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return '0.00'
    return numeric.toFixed(2)
}

function gc(value) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return 'GC 0.00'
    return `GC ${numeric.toFixed(2)}`
}

function finiteNumber(value, fallback = 0) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
}

function insight(id, tier, title, body, metricLabel = '', metricValue = '', tone = 'neutral') {
    return { id, tier, title, body, metricLabel, metricValue, tone }
}

function availableSelections(group) {
    return (group?.selections || []).filter(selection => Number(selection.decimalOdds) > 1)
}

function sourceLabel(source) {
    if (!source || source === 'synthetic') return 'Gampo synthetic'
    if (source === 'synthetic-estimate') return 'Estimated odds'
    if (source === 'sportsgameodds') return 'SportsGameOdds'
    if (source === 'api-football') return 'API-Football'
    if (source === 'odds-api-io') return 'odds-api.io'
    if (source === 'pandascore') return 'PandaScore'
    if (source === 'odds-api') return 'The Odds API'
    return source
}

function movement(selection) {
    const current = Number(selection?.decimalOdds ?? selection?.currentOdds)
    const previous = Number(selection?.previousOdds ?? selection?.acceptedOdds)
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
        return { direction: 'flat', diff: 0, label: 'No tracked move' }
    }
    const diff = roundCurrency(current - previous)
    if (diff > 0.015) return { direction: 'up', diff, label: `Up ${decimal(diff)}` }
    if (diff < -0.015) return { direction: 'down', diff, label: `Down ${decimal(Math.abs(diff))}` }
    return { direction: 'flat', diff: 0, label: 'Stable' }
}

function movementLesson(move, selection) {
    const current = decimal(selection?.decimalOdds ?? selection?.currentOdds)
    const previous = decimal(selection?.previousOdds ?? selection?.acceptedOdds)
    if (move.direction === 'up') {
        return `The price moved up from ${previous} to ${current}. Higher decimal odds pay more for the same stake, but they also imply the outcome is less likely than before.`
    }
    if (move.direction === 'down') {
        return `The price moved down from ${previous} to ${current}. Shorter decimal odds pay less for the same stake and usually mean the market is pricing this outcome as more likely.`
    }
    if (move.label === 'No tracked move') {
        return 'No previous price is available for this cell, so there is no line-movement lesson yet.'
    }
    return `The current price is close to the previous price at ${current}. Treat this as a stable line before checking break-even chance.`
}

function marketLesson(label = '') {
    const text = String(label).toLowerCase()
    if (text.includes('1x2') || text.includes('winner') || text.includes('moneyline') || text.includes('fixed win')) {
        return 'This market asks who wins the event. Soccer-style 1x2 adds Draw, so the probabilities must share space across three outcomes.'
    }
    if (text.includes('spread') || text.includes('handicap') || text.includes('line') || text.includes('puck') || text.includes('run')) {
        return 'Spread and handicap markets move the scoreboard before grading. The price and line must be read together.'
    }
    if (text.includes('total') || text.includes('over') || text.includes('under')) {
        return 'Totals ignore the winner and focus on the combined stat crossing a line, such as points, goals, maps, or runs.'
    }
    if (text.includes('prop') || text.includes('batter') || text.includes('kills')) {
        return 'Props isolate one player, team, or stat. Small data changes can move these prices faster than main markets.'
    }
    if (text.includes('correct score')) {
        return 'Correct-score markets have many low-probability outcomes. The big prices are tempting but need a much lower hit rate.'
    }
    if (text.includes('place') || text.includes('top 3')) {
        return 'Place-style racing markets can pay on a finishing range instead of only first place, so prices are usually shorter.'
    }
    if (text.includes('outright')) {
        return 'Outrights settle on a future winner across a field. Long prices can stay open for a long time, so movement and liquidity matter more than one isolated price.'
    }
    return 'This market converts an event opinion into prices. Start by reading break-even chance, then compare it with a fair estimate.'
}

function settlementMovementReview(ticket) {
    const moved = (ticket?.selections || []).filter(selection => (
        Number.isFinite(Number(selection.currentOdds))
        && Number.isFinite(Number(selection.acceptedOdds))
        && Math.abs(Number(selection.currentOdds) - Number(selection.acceptedOdds)) > 0.015
    ))
    if (moved.length === 0) {
        return 'No post-acceptance line movement snapshot is available for this settled ticket. The accepted odds still remain locked for review.'
    }
    return moved.map(selection => {
        const accepted = Number(selection.acceptedOdds)
        const current = Number(selection.currentOdds)
        const direction = current > accepted
            ? 'later price moved higher, so the accepted price was lower than the later snapshot'
            : 'accepted a price before it shortened'
        return `${selection.label}: accepted ${decimal(accepted)}, later ${decimal(current)} (${direction})`
    }).join('; ')
}

function settlementLegRows(ticket) {
    const legs = ticket?.legs || []
    const selections = ticket?.selections || []
    const stake = finiteNumber(ticket?.stake)
    const mode = ticket?.mode || ticket?.quote?.mode || BET_MODES.SINGLES
    const allLegsWon = legs.length > 0 && legs.every(leg => leg.won)
    const totalPayout = finiteNumber(ticket?.payout ?? ticket?.estimatedPayout)
    const stakePerLeg = mode === BET_MODES.SINGLES && legs.length ? stake / legs.length : 0
    const systemComboCount = mode === BET_MODES.SYSTEM_2 && legs.length >= 2 ? (legs.length * (legs.length - 1)) / 2 : 0

    return legs.map((leg, index) => {
        const selection = selections.find(item => item.selectionId === leg.selectionId)
            || selections.find(item => item.label === leg.label)
            || {}
        const acceptedOdds = finiteNumber(leg.odds ?? selection.acceptedOdds ?? selection.currentOdds)
        const probability = finiteNumber(leg.trueProbability ?? selection.trueProbability)
        const roll = finiteNumber(leg.roll)
        let returnRole = 'GC 0.00'

        if (mode === BET_MODES.SINGLES) {
            returnRole = gc(leg.won ? stakePerLeg * acceptedOdds : 0)
        } else if (mode === BET_MODES.MULTI) {
            returnRole = allLegsWon ? `all-leg ticket ${gc(totalPayout)}` : (leg.won ? 'won leg, ticket blocked' : 'blocked ticket')
        } else if (mode === BET_MODES.SYSTEM_2) {
            const paidCombos = legs.filter((other, otherIndex) => otherIndex !== index && leg.won && other.won).length
            returnRole = `${paidCombos}/${Math.max(0, legs.length - 1)} paid combos`
            if (systemComboCount > 0 && paidCombos > 0) {
                returnRole += `, stake base ${gc(stake / systemComboCount)}`
            }
        }

        return {
            label: leg.label || selection.label || `Leg ${index + 1}`,
            acceptedOdds,
            probability,
            roll,
            result: leg.won ? 'won' : 'lost',
            returnRole,
        }
    })
}

function marketNoVigRows(group) {
    const selections = availableSelections(group)
    const odds = selections.map(selection => Number(selection.decimalOdds))
    const probabilities = deVigProbabilities(odds)
    return selections.map((selection, index) => ({
        label: selection.label,
        decimalOdds: Number(selection.decimalOdds),
        impliedProbability: impliedProbability(selection.decimalOdds),
        noVigProbability: probabilities[index] || 0,
        fairOdds: fairDecimalOdds(probabilities[index] || 0),
    }))
}

export function analyzeSelection(selection, marketGroup = null) {
    const odds = Number(selection?.decimalOdds ?? selection?.currentOdds ?? selection?.acceptedOdds)
    const breakEven = impliedProbability(odds)
    const rows = marketGroup ? marketNoVigRows(marketGroup) : []
    const row = rows.find(item => item.label === selection?.label)
    const noVigProbability = row?.noVigProbability || 0
    const trueProbability = Number(selection?.trueProbability) || noVigProbability || 0
    const fairOdds = trueProbability > 0 ? fairDecimalOdds(trueProbability) : 0
    const edge = trueProbability - breakEven
    const move = movement(selection)
    const disabled = selection?.suspended || selection?.status === 'suspended' || selection?.status === 'locked'

    return {
        type: 'selection',
        title: `${selection?.label || 'Selection'} @ ${decimal(odds)}`,
        metrics: [
            { label: 'Break-even', value: formatPercent(breakEven) },
            { label: 'No-vig fair', value: noVigProbability ? formatPercent(noVigProbability) : 'n/a' },
            { label: 'Fair odds', value: fairOdds ? decimal(fairOdds) : 'n/a' },
            { label: 'Model edge', value: formatPercent(edge), tone: edge > 0 ? 'positive' : edge < 0 ? 'danger' : 'neutral' },
            { label: 'Move', value: move.label, tone: move.direction === 'up' ? 'positive' : move.direction === 'down' ? 'warning' : 'neutral' },
        ],
        insights: [
            insight(
                'selection-break-even',
                'beginner',
                'Read the price as a required hit rate',
                `Decimal ${decimal(odds)} needs this pick to win about ${formatPercent(breakEven)} of the time before it breaks even in practice credits.`,
                'Break-even',
                formatPercent(breakEven),
            ),
            insight(
                'selection-status',
                'beginner',
                disabled ? 'This price is not selectable' : 'Current status',
                disabled
                    ? 'Suspended or locked prices block practice placement because the market is unavailable.'
                    : 'Available prices can still move before placement. Worse moves may need manual acceptance.',
                'Status',
                disabled ? 'Blocked' : selection?.status || 'available',
                disabled ? 'danger' : 'neutral',
            ),
            insight(
                'selection-movement',
                'beginner',
                'Odds movement',
                movementLesson(move, selection),
                'Move',
                move.label,
                move.direction === 'up' ? 'positive' : move.direction === 'down' ? 'warning' : 'neutral',
            ),
            insight(
                'selection-no-vig',
                'intermediate',
                'Compare with the no-vig estimate',
                noVigProbability
                    ? `After removing the market margin, this outcome is around ${formatPercent(noVigProbability)} fair probability. That is a cleaner baseline than the raw price.`
                    : 'No full market was supplied, so this cell can only show raw break-even probability.',
                'No-vig',
                noVigProbability ? formatPercent(noVigProbability) : 'n/a',
            ),
            insight(
                'selection-edge',
                'advanced',
                edge > 0 ? 'Model says this is above fair' : 'Model does not beat the break-even line',
                `The local model probability is ${formatPercent(trueProbability)} versus a break-even rate of ${formatPercent(breakEven)}. Treat this as a simulator teaching signal, not a prediction.`,
                'Edge',
                formatPercent(edge),
                edge > 0 ? 'positive' : edge < 0 ? 'danger' : 'neutral',
            ),
            insight(
                'selection-source',
                'advanced',
                'Source caveat',
                selection?.estimated || selection?.source === 'synthetic-estimate'
                    ? 'This is a GamPo-estimated learning price generated from real fixture context. It is not a bookmaker quote; all ticket acceptance and settlement remain local fake-credit simulation.'
                    : `${sourceLabel(selection?.source)} can populate the displayed price, but all ticket acceptance and settlement remain local fake-credit simulation.`,
                'Source',
                sourceLabel(selection?.source),
            ),
        ],
    }
}

export function analyzeMarketGroup(group) {
    const rows = marketNoVigRows(group)
    const odds = rows.map(row => row.decimalOdds)
    const book = overround(odds)
    const margin = vig(odds)

    return {
        type: 'market',
        title: `${group?.label || 'Market'} analysis`,
        metrics: [
            { label: 'Outcomes', value: String(rows.length) },
            { label: 'Overround', value: formatPercent(book) },
            { label: 'Vig', value: formatPercent(margin), tone: margin > 0.08 ? 'warning' : 'neutral' },
            { label: 'Best fair price', value: rows.length ? decimal(Math.max(...rows.map(row => row.fairOdds))) : 'n/a' },
        ],
        rows,
        insights: [
            insight('market-type', 'beginner', group?.label || 'Market type', marketLesson(group?.label)),
            insight(
                'market-overround',
                'beginner',
                'Why prices can all look expensive',
                `The raw implied probabilities add to ${formatPercent(book)}. Anything above 100% is the book margin built into the displayed prices.`,
                'Vig',
                formatPercent(margin),
                margin > 0.08 ? 'warning' : 'neutral',
            ),
            insight(
                'market-devig',
                'intermediate',
                'Remove the margin before comparing outcomes',
                'The no-vig row normalizes every outcome so the market sums to 100%. Use that as the fair baseline before deciding whether a price is rich or cheap.',
                'No-vig total',
                '100.0%',
            ),
            insight(
                'market-sharp',
                'advanced',
                'Market shape matters',
                'Main markets usually absorb information faster than longshot props or correct scores. A high price is not automatically a good price.',
            ),
        ],
    }
}

export function analyzeTicket({ selections = [], stake = 0, mode = BET_MODES.SINGLES, quote = null } = {}) {
    const ticketQuote = quote || quoteTicket({ selections, stake, mode })
    const count = selections.length
    const sameGame = selections.some((selection, index) => (
        selection.eventId && selections.findIndex(other => other.eventId === selection.eventId) !== index
    ))
    const totalOdds = Number(ticketQuote.totalOdds) || 0
    const breakEven = mode === BET_MODES.SINGLES ? 0 : Number(ticketQuote.impliedChance) || impliedProbability(totalOdds)
    const modelChance = Number(ticketQuote.modelChance) || 0
    const profitIfMax = Math.max(0, Number(ticketQuote.estimatedPayout || 0) - Number(stake || 0))
    const stakeUnitLabel = mode === BET_MODES.SYSTEM_2 ? 'Stake/combo' : mode === BET_MODES.SINGLES ? 'Stake/leg' : 'Stake'
    const stakeUnitValue = mode === BET_MODES.SYSTEM_2
        ? gc(ticketQuote.stakePerCombo)
        : mode === BET_MODES.SINGLES
            ? gc(ticketQuote.stakePerLeg)
            : gc(stake)

    const modeBody = mode === BET_MODES.SINGLES
        ? 'Singles split the stake across selections. Each leg can return independently, so one loss does not automatically sink every other leg.'
        : mode === BET_MODES.SYSTEM_2
            ? 'A 2-of-N system divides the stake across every two-leg combo. It can still return when only some legs win, but each combo has a smaller stake.'
            : 'A multi multiplies every selected price. The displayed return grows fast, but every leg must win.'

    return {
        type: 'ticket',
        title: 'Practice ticket analysis',
        metrics: [
            { label: 'Selections', value: String(count) },
            { label: 'Stake', value: gc(stake) },
            { label: stakeUnitLabel, value: stakeUnitValue },
            ...(mode === BET_MODES.SYSTEM_2 ? [{ label: '2-leg combos', value: String(ticketQuote.combinations || 0) }] : []),
            { label: 'Est. return', value: gc(ticketQuote.estimatedPayout) },
            { label: 'EV hint', value: gc(ticketQuote.expectedValue), tone: ticketQuote.expectedValue >= 0 ? 'positive' : 'danger' },
        ],
        insights: [
            insight('ticket-mode', 'beginner', 'How this ticket pays', modeBody),
            ...(mode === BET_MODES.SINGLES ? [
                insight(
                    'ticket-singles-split',
                    'beginner',
                    'Stake is split per single',
                    `Your ${gc(stake)} stake is split into ${count || 0} independent singles at about ${gc(ticketQuote.stakePerLeg)} per leg.`,
                    'Per leg',
                    gc(ticketQuote.stakePerLeg),
                ),
            ] : []),
            insight(
                'ticket-payout',
                'beginner',
                'Return is not profit',
                `The estimated return is ${gc(ticketQuote.estimatedPayout)}. The maximum displayed profit after subtracting stake is about ${gc(profitIfMax)}.`,
                'Max profit',
                gc(profitIfMax),
            ),
            insight(
                'ticket-break-even',
                'intermediate',
                mode === BET_MODES.SINGLES ? 'Singles use per-leg break-even rates' : 'Combined break-even chance',
                mode === BET_MODES.SINGLES
                    ? 'For singles, judge each price on its own break-even chance instead of multiplying the whole card.'
                    : `This combined ticket needs to win about ${formatPercent(breakEven)} to break even before simulator variance.`,
                'Break-even',
                mode === BET_MODES.SINGLES ? 'per leg' : formatPercent(breakEven),
            ),
            ...(mode === BET_MODES.SYSTEM_2 ? [
                insight(
                    'ticket-system-combos',
                    'intermediate',
                    '2-of-N combo math',
                    `This system creates ${ticketQuote.combinations || 0} two-leg combos at about ${gc(ticketQuote.stakePerCombo)} each. A partial result can still return practice credits, but only combos where both legs win contribute.`,
                    'Combos',
                    String(ticketQuote.combinations || 0),
                ),
            ] : []),
            insight(
                'ticket-model',
                'advanced',
                'Model chance versus price',
                `The simulator model chance is ${formatPercent(modelChance)}. EV is only a teaching signal because feed prices and local settlement are not a real market.`,
                'Model chance',
                formatPercent(modelChance),
                ticketQuote.expectedValue >= 0 ? 'positive' : 'danger',
            ),
            ...(sameGame ? [
                insight(
                    'ticket-same-game',
                    'advanced',
                    'Correlation warning',
                    'Selections from the same event can be related. Simple multiplication can overstate or understate the real combined chance.',
                    'Same event',
                    'yes',
                    'warning',
                ),
            ] : []),
            insight(
                'ticket-odds-policy',
                'intermediate',
                'Odds-change policy',
                'Default policy accepts higher prices automatically. Worse prices require manual acceptance before practice placement.',
                'Policy',
                'Higher only',
            ),
        ],
    }
}

export function analyzeSettlement(ticket) {
    const legs = ticket?.legs || []
    const legRows = settlementLegRows(ticket)
    const stake = finiteNumber(ticket?.stake)
    const payout = finiteNumber(ticket?.payout ?? ticket?.estimatedPayout)
    const profit = Number.isFinite(Number(ticket?.profit)) ? Number(ticket.profit) : roundCurrency(payout - stake)
    const quote = ticket?.quote || quoteTicket(ticket || {})
    const expectedValue = finiteNumber(quote?.expectedValue)
    const resultTone = profit >= 0 ? 'positive' : expectedValue >= 0 ? 'warning' : 'danger'
    const resultCopy = expectedValue >= 0 && profit < 0
        ? 'This is a good-decision / bad-result sample: the quoted EV was not negative, but variance still won this round.'
        : expectedValue < 0 && profit > 0
            ? 'This is a bad-price / lucky-result sample: the ticket won, but the EV hint was negative before settlement.'
            : profit >= 0
                ? 'The ticket returned practice credits. Check whether the win came from price quality or variance.'
                : 'The ticket lost practice credits. Compare the accepted prices with each leg probability before judging the decision.'

    return {
        type: 'settlement',
        title: 'Settlement review',
        metrics: [
            { label: 'Stake', value: gc(stake) },
            { label: 'Returned', value: gc(payout) },
            { label: 'Profit', value: `${profit >= 0 ? '+' : ''}${gc(profit)}`, tone: profit >= 0 ? 'positive' : 'danger' },
            { label: 'Pre-settle EV', value: gc(expectedValue), tone: expectedValue >= 0 ? 'positive' : 'danger' },
        ],
        legRows,
        insights: [
            insight('settlement-result', 'beginner', 'Result versus decision quality', resultCopy, 'Outcome', ticket?.result || ticket?.status || 'settled', resultTone),
            insight(
                'settlement-rolls',
                'intermediate',
                'Leg probability, roll, and return role',
                legRows.length
                    ? legRows.map(row => `${row.label}: accepted ${decimal(row.acceptedOdds)}, roll ${decimal(row.roll)} vs ${formatPercent(row.probability)} (${row.result}), return role ${row.returnRole}`).join('; ')
                    : 'This ticket does not include leg-level settlement data yet.',
                'Legs',
                String(legRows.length),
            ),
            insight(
                'settlement-accepted-price',
                'advanced',
                'Accepted price snapshot',
                'Accepted odds are stored on the ticket, so later line movement does not rewrite the settled lesson.',
                'Snapshot',
                'locked',
            ),
            insight(
                'settlement-price-movement',
                'advanced',
                'Price movement review',
                settlementMovementReview(ticket),
                'Movement',
                'review',
            ),
        ],
    }
}
