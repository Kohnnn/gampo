// Translate the live poker game state into a GTO chart panel payload.
// Returns null while data is still loading.

import { allHandCodes, canonical } from '../util/handCanonicalize'
import { rolesForSeats } from '../util/positions'
import { classify } from '../util/textureClassify'
import { loadPreflop, loadPostflop } from './loader'

// Synchronous variant: takes already-loaded data (memoized JSON) and returns a payload.
export function buildPayload({ state, preflop, postflop, exploit = null }) {
    if (!state || !preflop) return null
    const heroIdx = state.players.findIndex(p => p.isHuman)
    if (heroIdx < 0) return null
    const seatCount = state.players.length
    const buttonIndex = state.buttonIndex
    const roles = rolesForSeats(seatCount, buttonIndex)
    const heroRole = roles[heroIdx]

    // Detect preflop action context from history.
    const street = state.street === 'idle' ? 'preflop' : state.street
    const heroHand = canonical(state.players[heroIdx]?.hole || [])

    // Build context bar.
    const board = (state.community || []).slice(0, 5)
    const boardLabel = board.length ? board.join(' ') : '—'

    if (street === 'preflop') {
        const vsContext = detectPreflopContext(state, roles, heroIdx)
        const grid = buildPreflopGrid({ preflop, heroRole, vsContext })
        return {
            mode: 'preflop',
            heroRole,
            heroHand,
            board: boardLabel,
            grid,
            sizings: grid.sizings,
            advantages: { nut: 0, range: 0 },
            mdf: null,
            breakdown: classifyBreakdown(grid),
            vsContext,
            actionLabel: vsContextToLabel(vsContext, heroRole),
            note: grid.context || `${heroRole} preflop · ${vsContextToLabel(vsContext, heroRole)}`,
        }
    }

    // Postflop
    const texture = classify(board)
    const matchupKey = `${roles[buttonIndex]}-vs-${heroRole === 'BTN' ? roles[(buttonIndex + 1) % seatCount] : heroRole}`
    const flop = pickPostflop(postflop, matchupKey, texture?.key, street)
    if (!flop) {
        return {
            mode: 'postflop',
            heroRole,
            heroHand,
            board: boardLabel,
            grid: null,
            sizings: [],
            advantages: { nut: 0, range: 0 },
            mdf: null,
            breakdown: { value: [], bluff: [], marginal: [] },
            note: `Texture ${texture?.key || 'unknown'} not authored`,
        }
    }
    const exploitDelta = exploit && postflop?.exploits?.[exploit] ? postflop.exploits[exploit] : null
    return {
        mode: 'postflop',
        heroRole,
        heroHand,
        board: boardLabel,
        textureKey: texture?.key || 'default',
        grid: buildPostflopGrid(flop),
        sizings: flop.sizings || [],
        advantages: flop.advantage || { nut: 0, range: 0 },
        mdf: flop.mdf ?? null,
        breakdown: { value: flop.value || [], bluff: flop.bluff || [], marginal: flop.marginal || [] },
        note: `${matchupKey} ${street} · ${texture?.key || 'default'}`,
        exploit: exploitDelta,
    }
}

// Async fetch + payload helper.
export async function fetchPayload(state, exploit = null) {
    const [preflop, postflop] = await Promise.all([loadPreflop(), loadPostflop()])
    return buildPayload({ state, preflop, postflop, exploit })
}

function detectPreflopContext(state, roles, heroIdx) {
    // Walk history for raises before hero acted.
    const heroRole = roles[heroIdx]
    const raises = state.history.filter(h => h.type === 'raise')
    if (heroRole === 'BB' || heroRole === 'SB') {
        const firstRaise = raises[0]
        if (firstRaise) {
            const raiserIdx = state.players.findIndex(p => p.id === firstRaise.player)
            if (raiserIdx >= 0) return `vs-${roles[raiserIdx].toLowerCase()}-open`
        }
        return null
    }
    // For BTN/CO/MP/UTG: check whether someone (typically BB) 3bet our open.
    const heroId = state.players[heroIdx]?.id
    const heroOpenedIdx = raises.findIndex(r => r.player === heroId)
    if (heroOpenedIdx >= 0 && raises.length > heroOpenedIdx + 1) {
        const threeBettor = raises[heroOpenedIdx + 1]
        const threeBettorIdx = state.players.findIndex(p => p.id === threeBettor.player)
        if (threeBettorIdx >= 0) return `vs-${roles[threeBettorIdx].toLowerCase()}-3bet`
    }
    return 'rfi'
}

function vsContextToLabel(ctx, heroRole) {
    if (!ctx || ctx === 'rfi') return `${heroRole} RFI (open or fold)`
    if (ctx.startsWith('vs-')) {
        const m = ctx.match(/^vs-(\w+)-(open|3bet|4bet)$/)
        if (m) return `${heroRole} vs ${m[1].toUpperCase()} ${m[2]}`
    }
    return ctx
}

function buildPreflopGrid({ preflop, heroRole, vsContext }) {
    const node = preflop.positions?.[heroRole]
    const rangeNode = node?.[vsContext || 'rfi'] || node?.['rfi'] || null
    const ranges = rangeNode?.ranges || {}
    const cells = {}
    for (const code of allHandCodes()) {
        const r = ranges[code]
        if (!r) {
            cells[code] = { raise: 0, call: 0, fold: 1 }
        } else {
            const raise = Number(r.raise) || 0
            const call = Number(r.call) || 0
            const fold = 1 - raise - call
            cells[code] = { raise, call, fold: Math.max(0, fold) }
        }
    }
    return {
        cells,
        sizings: rangeNode?.size ? [{ size: rangeNode.size, freq: 1 }] : [],
        context: rangeNode?.notes || null,
    }
}

function buildPostflopGrid(flop) {
    // Convert value/bluff/marginal lists into cell intensities.
    const cells = {}
    for (const code of allHandCodes()) {
        cells[code] = { raise: 0, call: 0, fold: 1 }
    }
    const tagOnly = (list) => list.filter(item => /^[A-Z2-9TJQK]{2,3}[so]?$/i.test(item))
    for (const code of tagOnly(flop.value || [])) {
        if (cells[code]) cells[code] = { raise: 0.85, call: 0.15, fold: 0 }
    }
    for (const code of tagOnly(flop.bluff || [])) {
        if (cells[code]) cells[code] = { raise: 0.6, call: 0, fold: 0.4 }
    }
    for (const code of tagOnly(flop.marginal || [])) {
        if (cells[code]) cells[code] = { raise: 0.25, call: 0.55, fold: 0.20 }
    }
    return { cells, sizings: flop.sizings || [], context: null }
}

function pickPostflop(postflop, matchupKey, textureKey, street) {
    const root = postflop?.matchup?.[matchupKey] || postflop?.matchup?.default
    if (!root) return null
    const ctx = root['rfi-call'] || Object.values(root)[0]
    if (!ctx) return null
    const streetNode = ctx[street] || ctx['flop']
    if (!streetNode) return null
    return streetNode[textureKey] || streetNode.default || null
}

function classifyBreakdown(grid) {
    const value = []
    const bluff = []
    const marginal = []
    for (const [code, c] of Object.entries(grid.cells || {})) {
        if (c.raise >= 0.95) value.push(code)
        else if (c.raise >= 0.4 && c.call < 0.4) bluff.push(code)
        else if (c.call >= 0.4) marginal.push(code)
    }
    return { value: value.slice(0, 24), bluff: bluff.slice(0, 24), marginal: marginal.slice(0, 24) }
}
