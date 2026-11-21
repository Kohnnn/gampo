import { useMemo } from 'react'
import { useCredits } from '../context/CreditContext'

// Honest simulation activity ticker. This project is a fake-credit simulator with
// no real players, so this surface never presents fabricated "other players".
//
// It shows the user's OWN recent local credits received, taken directly from the
// ledger. It deliberately does NOT call them "wins": the credit ledger has no
// profit field, so a stake refund (push/surrender), a mission grant and a real
// payout are all just positive `type:'win'` entries. Labeling any of them a "win"
// or computing a net figure would misstate the user's own history, so the label
// states exactly what the data is — credits received in this browser.
//
// When there is no local history yet, a clearly-marked illustrative set is shown.
const ILLUSTRATIVE_EXAMPLES = [
    { game: 'Crash', delta: 2847.5 },
    { game: 'Plinko', delta: 1204.0 },
    { game: 'Slots', delta: 5620.0 },
    { game: 'Dice', delta: 890.25 },
]

// Illustrative rows are fake round numbers, so abbreviating them is honest.
function formatExample(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toFixed(0)
}

// Real ledger amounts must be shown at the ledger's own precision (2 dp) —
// abbreviating a credited amount would misstate what the user actually received.
function formatCredits2dp(n) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Up to 4 most recent local credits RECEIVED (newest-first), with their real label. */
function deriveLocalCredits(transactions) {
    if (!Array.isArray(transactions)) return []
    return transactions
        // `grant` (lobby/header top-up) and `win` both credit the balance.
        // `reset` is excluded: its stored amount is the new BALANCE, not a credit.
        .filter(tx => tx && (tx.type === 'win' || tx.type === 'grant') && Number(tx.amount) > 0)
        .slice(0, 4)
        .map(tx => ({
            game: String(tx.label || 'Credits'),
            delta: Number(tx.amount),
        }))
}

export function LiveWinsTicker() {
    const { transactions } = useCredits()
    const local = useMemo(() => deriveLocalCredits(transactions), [transactions])
    const usingLocal = local.length > 0
    const rows = usingLocal ? local : ILLUSTRATIVE_EXAMPLES

    return (
        <div
            className="casino-live-ticker"
            aria-label={usingLocal ? 'Your recent local practice credits' : 'Illustrative example credits (simulated)'}
        >
            <div className="casino-live-ticker-inner">
                <span className="ticker-label" data-simulated-label>
                    {usingLocal ? 'YOUR RECENT CREDITS' : 'EXAMPLE CREDITS · SIMULATED'}
                </span>
                {rows.map((win, i) => (
                    <div key={`${win.game}-${i}`} className="ticker-item">
                        <span className="ticker-dot" />
                        {!usingLocal && <span className="ticker-player">Demo</span>}
                        <span className="ticker-game">{win.game}</span>
                        <span className="ticker-win">+{usingLocal ? formatCredits2dp(win.delta) : formatExample(win.delta)} GC</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
