import { fakePlayers, personaTemplates } from '../../../context/SocialContext'
import { clamp, dicePayout, formatCredits, kenoPayout, round2 } from '../../../utils/simulationMath'
import { createRoundRng } from '../../../utils/roundRng'

export const SIM_BET_ROW_DEFAULT_CAP = 10
export const SIM_BET_ROW_MAX_CAP = 12

const GRID_CELLS = 25
const HOUSE_EDGE = 0.01

const PERSONA_PROFILES = {
    whale: { stake: [45, 240], targetBias: 1.7, risk: 0.9 },
    analyst: { stake: [8, 55], targetBias: 1.05, risk: 0.5 },
    gambler: { stake: [12, 90], targetBias: 1.35, risk: 0.72 },
    cautious: { stake: [1, 14], targetBias: 0.62, risk: 0.24 },
    streaker: { stake: [6, 48], targetBias: 1.18, risk: 0.62 },
    mod: { stake: [1, 8], targetBias: 0.5, risk: 0.18 },
}

const PLAYER_COLORS = ['#ff7ab6', '#6db7ff', '#ffcf5a', '#9bf08a', '#c08bff', '#ff9457', '#5be0d4', '#41d6ff', '#ffe680', '#7bd389']

const WHEEL_PRESETS = {
    low: [0, 1.2, 1.2, 1.5, 0, 2, 1.2, 1.5, 0, 2, 1.2, 3],
    medium: [0, 0, 1.5, 0, 2, 0, 3, 0, 1.5, 0, 5, 0],
    high: [0, 0, 0, 2, 0, 0, 5, 0, 0, 10, 0, 25],
}

const RISK_BY_PERSONA = {
    whale: 'high',
    gambler: 'high',
    streaker: 'medium',
    analyst: 'medium',
    cautious: 'low',
    mod: 'low',
}

function profileFor(persona) {
    return PERSONA_PROFILES[persona] || PERSONA_PROFILES.gambler
}

function makeSeed(gameId, context, index = 0) {
    return String(context.seed || `${gameId}:${context.roundId || 'round'}:${index}`)
}

function shuffleRoster(seed) {
    const rng = createRoundRng(seed)
    const roster = [...fakePlayers]
    for (let i = roster.length - 1; i > 0; i -= 1) {
        const j = rng.nextInt(i + 1)
        const temp = roster[i]
        roster[i] = roster[j]
        roster[j] = temp
    }
    return roster
}

function makeBase(gameId, context = {}, index = 0) {
    const seed = makeSeed(gameId, context, index)
    const rng = createRoundRng(seed)
    const player = context.player || shuffleRoster(`${seed}:roster`)[index % fakePlayers.length]
    const profile = profileFor(player.persona)
    const [minStake, maxStake] = profile.stake
    const stake = round2(minStake + rng.next() * (maxStake - minStake))
    const templates = personaTemplates[player.persona] || personaTemplates.gambler || []
    const comment = templates.length ? templates[rng.nextInt(templates.length)] : ''
    return {
        seed,
        rng,
        player,
        profile,
        stake,
        comment,
        color: PLAYER_COLORS[(fakePlayers.findIndex(item => item.id === player.id) + PLAYER_COLORS.length) % PLAYER_COLORS.length],
    }
}

function resultLabel(profit) {
    if (profit > 0) return `+${formatCredits(profit)}`
    if (profit < 0) return `-${formatCredits(Math.abs(profit))}`
    return formatCredits(0)
}

function formatMultiplier(value) {
    return `${round2(value).toFixed(2)}×`
}

export function estimateMinesMultiplier(picks, bombs) {
    if (picks <= 0) return 1
    let m = 1
    for (let i = 0; i < picks; i += 1) {
        m *= (GRID_CELLS - i) / (GRID_CELLS - bombs - i)
    }
    return round2(m * (1 - HOUSE_EDGE))
}

function estimatePlinkoMultiplier(rows, risk, binIndex) {
    const center = rows / 2
    const distance = Math.abs(binIndex - center) / Math.max(1, center)
    const base = risk === 'high' ? 0.25 : risk === 'medium' ? 0.45 : 0.65
    const top = risk === 'high' ? 24 : risk === 'medium' ? 9 : 4
    const curve = risk === 'high' ? 2.8 : risk === 'medium' ? 2.15 : 1.55
    return round2(base + Math.pow(distance, curve) * top)
}

function makeRow(base, gameId, payload) {
    const profit = Number.isFinite(payload.profit) ? payload.profit : (payload.multiplier > 0 ? base.stake * payload.multiplier - base.stake : -base.stake)
    const tone = payload.state === 'lost' || payload.state === 'busted' ? 'lost' : profit > 0 ? 'won' : 'neutral'
    return {
        id: `${gameId}-${base.player.id}-${base.seed.replace(/[^a-z0-9_-]/gi, '').slice(-18)}`,
        gameId,
        playerId: base.player.id,
        name: base.player.name,
        persona: base.player.persona,
        color: base.color,
        stake: base.stake,
        comment: base.comment,
        tone,
        state: payload.state || tone,
        action: payload.action,
        detail: payload.detail,
        metric: payload.metric,
        result: payload.result || resultLabel(profit),
        multiplier: payload.multiplier || 0,
        profit,
        meta: payload.meta || {},
    }
}

function buildMinesRow(base, context) {
    const { rng, profile } = base
    const bombChoices = profile.risk >= 0.75 ? [5, 10, 15] : profile.risk <= 0.3 ? [1, 3, 5] : [3, 5, 10]
    const bombs = Number.isFinite(context.bombs) ? context.bombs : bombChoices[rng.nextInt(bombChoices.length)]
    const maxSafe = Math.max(1, GRID_CELLS - bombs)
    const targetPicks = 1 + Math.floor((profile.risk * 0.7 + rng.next() * 0.35) * Math.min(12, maxSafe))
    const picks = clamp(targetPicks, 1, maxSafe)
    const busted = rng.next() < (0.1 + profile.risk * 0.28 + bombs / 140)
    const multiplier = busted ? 0 : estimateMinesMultiplier(picks, bombs)
    return makeRow(base, 'mines', {
        state: busted ? 'busted' : 'won',
        action: `revealed ${picks}`,
        detail: busted ? `hit a mine with ${bombs} bombs` : `cashed @${formatMultiplier(multiplier)}`,
        metric: `${bombs} bombs`,
        multiplier,
        meta: { bombs, picks, cashed: !busted },
    })
}

function buildDiceRow(base, context) {
    const { rng, profile } = base
    const low = profile.risk >= 0.75 ? 5 : profile.risk <= 0.3 ? 58 : 30
    const high = profile.risk >= 0.75 ? 28 : profile.risk <= 0.3 ? 88 : 66
    const winChance = round2(Number.isFinite(context.winChance) ? context.winChance : low + rng.next() * (high - low))
    const mode = context.rollMode || (rng.next() > 0.5 ? 'over' : 'under')
    const roll = round2(rng.next() * 100)
    const won = mode === 'under' ? roll < winChance : roll > (100 - winChance)
    const multiplier = won ? dicePayout(winChance / 100) : 0
    return makeRow(base, 'dice', {
        state: won ? 'won' : 'lost',
        action: `${mode === 'under' ? 'under' : 'over'} ${mode === 'under' ? winChance.toFixed(2) : (100 - winChance).toFixed(2)}`,
        detail: `${winChance.toFixed(2)}% chance · rolled ${roll.toFixed(2)}`,
        metric: won ? formatMultiplier(multiplier) : 'miss',
        multiplier,
        meta: { winChance, rollMode: mode, roll },
    })
}

function buildPlinkoRow(base, context) {
    const { rng, profile } = base
    const rows = Number.isFinite(context.rows) ? context.rows : [8, 10, 12, 14, 16][rng.nextInt(5)]
    const risk = context.risk || RISK_BY_PERSONA[base.player.persona] || 'medium'
    const binIndex = Number.isFinite(context.binIndex) ? context.binIndex : rng.nextInt(rows + 1)
    const multiplier = Number.isFinite(context.multiplier) ? round2(context.multiplier) : estimatePlinkoMultiplier(rows, risk, binIndex)
    const state = multiplier >= 1 ? 'won' : 'lost'
    return makeRow(base, 'plinko', {
        state,
        action: `${rows} rows · bin ${binIndex}`,
        detail: `${risk} risk ball landed ${binIndex}/${rows}`,
        metric: formatMultiplier(multiplier),
        multiplier,
        meta: { rows, risk, binIndex, personaRisk: profile.risk },
    })
}

function buildLimboRow(base, context) {
    const { rng, profile } = base
    const target = round2(Number.isFinite(context.target)
        ? context.target
        : clamp(1.08 + Math.pow(rng.next(), 1.25) * 8 * profile.targetBias, 1.08, 100))
    const chance = clamp((1 - HOUSE_EDGE) / target, 0.001, 0.99)
    const won = rng.next() < chance
    const actual = round2(won
        ? target + rng.next() * Math.max(0.08, target * 0.55)
        : 1 + rng.next() * Math.max(0.05, target - 1) * 0.96)
    return makeRow(base, 'limbo', {
        state: won ? 'won' : 'lost',
        action: `target ${formatMultiplier(target)}`,
        detail: `actual roll ${formatMultiplier(actual)}`,
        metric: won ? 'cleared' : 'below',
        multiplier: won ? target : 0,
        meta: { target, actual, chance },
    })
}

function buildWheelRow(base, context) {
    const { rng } = base
    const risk = context.risk || RISK_BY_PERSONA[base.player.persona] || 'medium'
    const segments = WHEEL_PRESETS[risk] || WHEEL_PRESETS.medium
    const segmentIndex = Number.isFinite(context.segmentIndex) ? context.segmentIndex : rng.nextInt(segments.length)
    const multiplier = Number.isFinite(context.multiplier) ? context.multiplier : segments[segmentIndex]
    return makeRow(base, 'wheel', {
        state: multiplier > 1 ? 'won' : 'lost',
        action: `${risk} segment ${segmentIndex + 1}`,
        detail: `wheel hit ${formatMultiplier(multiplier)}`,
        metric: formatMultiplier(multiplier),
        multiplier,
        meta: { risk, segmentIndex },
    })
}

function buildKenoRow(base, context) {
    const { rng, profile } = base
    const spots = clamp(Number.isFinite(context.spots)
        ? context.spots
        : Math.round(3 + profile.risk * 6 + rng.next() * 2), 1, 10)
    let matches = Number.isFinite(context.matches) ? context.matches : 0
    if (!Number.isFinite(context.matches)) {
        for (let i = 0; i < spots; i += 1) {
            if (rng.next() < 0.25) matches += 1
        }
    }
    matches = clamp(matches, 0, spots)
    const multiplier = kenoPayout(spots, matches)
    return makeRow(base, 'keno', {
        state: multiplier > 0 ? 'won' : 'lost',
        action: `picked ${spots} spots`,
        detail: `matched ${matches}/${spots}`,
        metric: formatMultiplier(multiplier),
        multiplier,
        meta: { spots, matches },
    })
}

const BUILDERS = {
    mines: buildMinesRow,
    dice: buildDiceRow,
    plinko: buildPlinkoRow,
    limbo: buildLimboRow,
    wheel: buildWheelRow,
    keno: buildKenoRow,
}

export function makeSimBetRow(gameId, context = {}) {
    const base = makeBase(gameId, context, context.index || 0)
    const builder = BUILDERS[gameId] || buildDiceRow
    return builder(base, context)
}

export function clampSimRows(rows, cap = SIM_BET_ROW_DEFAULT_CAP) {
    const limit = Number.isFinite(cap) ? Math.max(1, Math.min(SIM_BET_ROW_MAX_CAP, Math.round(cap))) : SIM_BET_ROW_DEFAULT_CAP
    return Array.isArray(rows) ? rows.slice(0, limit) : []
}

export function prependSimBetRow(rows, row, cap = SIM_BET_ROW_DEFAULT_CAP) {
    if (!row) return clampSimRows(rows, cap)
    return clampSimRows([row, ...(Array.isArray(rows) ? rows : [])], cap)
}

export function makeInitialSimBetRows(gameId, context = {}) {
    const count = Number.isFinite(context.count) ? context.count : 8
    const seed = context.seed || `${gameId}:initial`
    const roster = shuffleRoster(`${seed}:initial-roster`)
    const rows = Array.from({ length: count }, (_, index) => makeSimBetRow(gameId, {
        ...context,
        player: roster[index % roster.length],
        index,
        seed: `${seed}:${index}`,
    }))
    return clampSimRows(rows, context.cap || count)
}

export function personaSimProfile(persona) {
    return { ...profileFor(persona) }
}
