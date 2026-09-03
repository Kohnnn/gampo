import { forwardRef } from 'react'
import { BadgeDollarSign } from 'lucide-react'

const MobileSportsNav = forwardRef(function MobileSportsNav({ selectionCount, onOpenBetSlip }, ref) {
    return (
        <button ref={ref} type="button" className="sb-mobile-slip-pill" onClick={onOpenBetSlip} aria-label="Open bet slip" data-ux-surface="dock" data-ux-primary-action>
            <BadgeDollarSign size={17} />
            <span>Bet Slip</span>
            <b>{selectionCount}</b>
        </button>
    )
})

export default MobileSportsNav
