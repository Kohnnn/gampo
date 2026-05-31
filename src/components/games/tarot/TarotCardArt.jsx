import { SUITS, TAROT_BACK_IMAGE, tarotCardImage } from './tarotModel'

export default function TarotCardArt({ card, hidden, position, matched, multiplier }) {
    const suit = card ? SUITS[card.suit] || SUITS.major : null
    const color = suit?.color || '#b478ff'

    if (hidden) {
        return (
            <div className="tarot-card tarot-card-back-face" style={{ '--rarity': color }}>
                <img src={TAROT_BACK_IMAGE} alt="" draggable="false" />
                <span className="tarot-card-position">{position}</span>
                <span className="tarot-hidden-label">Pull</span>
            </div>
        )
    }

    return (
        <div className={`tarot-card tarot-card-face ${matched ? 'matched' : ''} ${card.isMajor ? 'major' : ''}`} style={{ '--rarity': color }}>
            <img src={tarotCardImage(card)} alt={`${position}: ${card.name}`} draggable="false" />
            <span className="tarot-card-position">{position}</span>
            <span className="tarot-card-title">{card.name}</span>
            <span className="tarot-card-corner">{card.displayRank || card.rank}</span>
            <span className="tarot-card-suit" style={{ color }}>{suit?.mark}</span>
            <span className="tarot-card-mult">x{multiplier.toFixed(2)}</span>
        </div>
    )
}
