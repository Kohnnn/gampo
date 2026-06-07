import { BadgeDollarSign } from 'lucide-react'

function MobileSportsNav({ selectionCount, onOpenBetSlip }) {
    if (!selectionCount) return null

    return (
        <button type="button" className="sb-mobile-slip-pill" onClick={onOpenBetSlip} aria-label="Open bet slip" data-ux-surface="dock" data-ux-primary-action>
            <BadgeDollarSign size={17} />
            <span>Bet Slip</span>
            <b>{selectionCount}</b>
        </button>
    )
}

export default MobileSportsNav
