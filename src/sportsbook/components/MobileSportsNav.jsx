import { BadgeDollarSign, Gamepad2, MessageSquare, Search, Trophy } from 'lucide-react'

function MobileSportsNav({ selectionCount, onBrowse, onSearch, onOpenBetSlip, onCasino }) {
    return (
        <nav className="sb-mobile-nav" aria-label="Mobile sportsbook navigation">
            <button type="button" onClick={onSearch}>
                <Search size={19} />
                <span>Browse</span>
            </button>
            <button type="button" onClick={onCasino}>
                <Gamepad2 size={19} />
                <span>Casino</span>
            </button>
            <button type="button" onClick={onOpenBetSlip}>
                <BadgeDollarSign size={19} />
                <span>Bet Slip</span>
                {selectionCount ? <b>{selectionCount}</b> : null}
            </button>
            <button type="button" className="is-active" onClick={onBrowse}>
                <Trophy size={19} />
                <span>Sports</span>
            </button>
            <button type="button" onClick={() => document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'chat' } }))}>
                <MessageSquare size={19} />
                <span>Chat</span>
            </button>
        </nav>
    )
}

export default MobileSportsNav
