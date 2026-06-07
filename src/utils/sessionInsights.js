// sessionInsights — derive an educational dashboard from PnL history.
//
// Turns the raw recordPnl entries (and optional progress stats) into the
// numbers a player needs to understand their own variance:
//   - realized RTP vs the wagered total
//   - net profit, biggest win/loss, average bet
//   - longest win/loss streaks
//   - a per-game breakdown (profit, RTP, rounds)
//   - a "real-money" framing: what this volume would have cost at a real stake
//
// Pure (no React/localStorage) so it is fully unit-testable.

import { round2 } from './simulationMath'

function computeStreaks(entries) {
    let bestWin = 0
    let bestLoss = 0
    let curWin = 0
    let curLoss = 0
    for (const e of entries) {
        if (e.profit > 0) {
            curWin += 1
            curLoss = 0
        } else if (e.profit < 0) {
            curLoss += 1
            curWin = 0
        } else {
            curWin = 0
            curLoss = 0
        }
        bestWin = Math.max(bestWin, curWin)
        bestLoss = Math.max(bestLoss, curLoss)
    }
    return { bestWin, bestLoss, currentWin: curWin, currentLoss: curLoss }
}

/**
 * @param {Array} entries - PnL history entries { ts, gameId, profit, betAmount, label }
 * @param {object} [options]
 * @param {number} [options.realStakeMultiplier=1] - scale practice credits to a
 *        hypothetical real currency for the "what this would have cost" framing.
 */
export function buildSessionInsights(entries = [], options = {}) {
    const list = Array.isArray(entries) ? entries : []
    const count = list.length

    let profit = 0
    let wagered = 0
    let returned = 0
    let wins = 0
    let losses = 0
    let pushes = 0
    let biggestWin = 0
    let biggestLoss = 0
    const perGame = new Map()

    for (const e of list) {
        const p = Number(e.profit) || 0
        const bet = Number(e.betAmount) || 0
        profit += p
        wagered += bet
        // returned = stake back + profit on the round (returned/wagered = RTP)
        returned += bet + p
        if (p > 0) { wins += 1; biggestWin = Math.max(biggestWin, p) }
        else if (p < 0) { losses += 1; biggestLoss = Math.min(biggestLoss, p) }
        else pushes += 1

        const id = e.gameId || 'unknown'
        const g = perGame.get(id) || { gameId: id, count: 0, profit: 0, wagered: 0, returned: 0 }
        g.count += 1
        g.profit += p
        g.wagered += bet
        g.returned += bet + p
        perGame.set(id, g)
    }

    const realizedRtp = wagered > 0 ? returned / wagered : null
    const houseTake = wagered > 0 ? round2((wagered - returned)) : 0
    const avgBet = count > 0 ? wagered / count : 0
    const winRate = count > 0 ? wins / count : 0
    const streaks = computeStreaks(list)
    const realStakeMultiplier = Number(options.realStakeMultiplier) || 1

    const games = Array.from(perGame.values())
        .map(g => ({
            ...g,
            profit: round2(g.profit),
            wagered: round2(g.wagered),
            rtp: g.wagered > 0 ? round2(g.returned / g.wagered) : null,
        }))
        .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))

    return {
        count,
        wins,
        losses,
        pushes,
        winRate: round2(winRate),
        profit: round2(profit),
        wagered: round2(wagered),
        returned: round2(returned),
        realizedRtp: realizedRtp != null ? round2(realizedRtp) : null,
        houseTake,
        avgBet: round2(avgBet),
        biggestWin: round2(biggestWin),
        biggestLoss: round2(biggestLoss),
        streaks,
        games,
        // Real-stakes framing: at a real stake this volume would, on average,
        // have cost the house take. Net is the actual realized profit scaled.
        realStakes: {
            multiplier: realStakeMultiplier,
            wagered: round2(wagered * realStakeMultiplier),
            net: round2(profit * realStakeMultiplier),
        },
        reliable: count >= 20,
    }
}
