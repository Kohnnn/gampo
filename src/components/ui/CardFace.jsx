// Shared playing-card face. Used by Blackjack, Video Poker, Baccarat, War.
// Pure presentational, no game logic. Suits use Unicode glyphs and red/black
// CSS classes for color. Ranks render as text in the corner + a center pip.

const SUIT_GLYPH = { '♠': '♠', '♥': '♥', '♦': '♦', '♣': '♣', S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_COLOR = { '♥': 'red', '♦': 'red', H: 'red', D: 'red', '♠': 'black', '♣': 'black', S: 'black', C: 'black' }

export default function CardFace({ rank, suit, hidden = false, dealing = false, size = 'md', className = '' }) {
    if (hidden) return <CardBack size={size} className={className} dealing={dealing} />
    const glyph = SUIT_GLYPH[suit] || suit || '?'
    const color = SUIT_COLOR[suit] || 'black'
    return (
        <span className={`gampo-card gampo-card-face ${color} size-${size} ${dealing ? 'dealing' : ''} ${className}`} role="img" aria-label={`${rank} of ${glyph}`}>
            <span className="gampo-card-corner gampo-card-corner-tl">
                <span className="gampo-card-rank">{rank}</span>
                <span className="gampo-card-suit">{glyph}</span>
            </span>
            <span className="gampo-card-pip">{glyph}</span>
            <span className="gampo-card-corner gampo-card-corner-br">
                <span className="gampo-card-rank">{rank}</span>
                <span className="gampo-card-suit">{glyph}</span>
            </span>
        </span>
    )
}

export function CardBack({ size = 'md', className = '', dealing = false }) {
    return (
        <span className={`gampo-card gampo-card-back size-${size} ${dealing ? 'dealing' : ''} ${className}`} aria-hidden="true">
            <span className="gampo-card-back-pattern" />
        </span>
    )
}
