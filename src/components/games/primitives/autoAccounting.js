// Shared Auto/Repeat loop accounting contract.
//
// Every paid round resolves one of the six authority result kinds (see
// phase-01-authority-command-contract_PROPOSAL_30-10-26.md §2.2). Only a
// `committed` result counts as an accepted round: it carries a real debit and
// (possibly) a payout. A refusal must resolve a non-`committed` kind so the
// loop can tell a rejection from an accepted zero-profit push — `{profit:0}`
// alone is ambiguous and must never be the sole discriminator.
//
// This module is the single reconciliation point so a keyboard regression or a
// per-game result-shape change can never silently move an accounting decision.

// One declaration, re-exported. Two hand-maintained copies is how `superseded`
// lands in one and not the other, silently making a superseded round look
// committed to the loop.
export { RESULT_KINDS } from '../../../authority/resultContract.js'
import { RESULT_KINDS as CONTRACT_KINDS } from '../../../authority/resultContract.js'
const RESULT_KINDS = CONTRACT_KINDS


const isAccepted = kind => kind === 'committed'

// Normalize any per-game resolution into the six-kind shape.
// Legacy games resolve `{profit}` (or `{profit, error}`); a positive balance
// movement is `committed`. A refusal must already carry an explicit non-zero
// kind, otherwise it is treated as committed (current behavior is preserved for
// a game that has not migrated yet) — call out the ambiguity instead of guessing.
//
// A committed authority envelope carries its economics under `value`
// (`committed({ value: { profit } })`), not at the top level. Reading only
// `result.profit` there yields 0, so a real win reconciles as a break-even
// round and the Auto stop-loss/stop-profit limits never fire.
function profitOf(result) {
    const direct = Number(result?.profit)
    if (Number.isFinite(direct)) return direct
    const nested = Number(result?.value?.profit)
    return Number.isFinite(nested) ? nested : 0
}

export function normalizeBetResult(result) {
    if (result && typeof result === 'object' && RESULT_KINDS.includes(result.kind)) {
        return { kind: result.kind, profit: profitOf(result), result }
    }
    // Legacy shape. `committed` is the only kind that books a debit.
    return { kind: 'committed', profit: profitOf(result), result }
}

export const acceptedResult = (profit, extra = {}) => ({ kind: 'committed', profit: Number(profit) || 0, ...extra })
export const rejectedResult = (code, extra = {}) => ({ kind: 'rejected', code, profit: 0, ...extra })
export const notAdmittedResult = (code, extra = {}) => ({ kind: 'not-admitted', code, profit: 0, ...extra })

// One loop step. Pure: takes the loop state and one resolved round result,
// returns the next state plus whether the loop should stop. `acceptedRounds`
// is the count that must reconcile against debits; a refusal never increments
// it. Stop-profit/loss accumulate only accepted profit.
export function accountAutoRound(state, rawResult) {
    const { kind, profit } = normalizeBetResult(rawResult)
    const accepted = isAccepted(kind)
    const next = {
        ...state,
        rounds: state.rounds + (accepted ? 1 : 0),
        refusals: state.refusals + (accepted ? 0 : 1),
        sessionProfit: state.sessionProfit + (accepted ? profit : 0),
        lastProfit: accepted ? profit : state.lastProfit,
        lastKind: kind,
    }
    const limitProfit = Number(state.limitProfit)
    const limitLoss = Number(state.limitLoss)
    const limitBigWin = Number(state.limitBigWin)
    let stop = false
    if (Number.isFinite(limitProfit) && limitProfit > 0 && next.sessionProfit >= limitProfit) stop = true
    else if (Number.isFinite(limitLoss) && limitLoss > 0 && next.sessionProfit <= -limitLoss) stop = true
    else if (Number.isFinite(limitBigWin) && limitBigWin > 0 && accepted && profit >= limitBigWin) stop = true
    return { state: next, accepted, stop }
}
