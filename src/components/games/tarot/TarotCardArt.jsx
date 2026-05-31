import { SUITS } from './tarotModel'

function Motif({ id, color }) {
    const stroke = color || '#b478ff'
    switch (id) {
        case 'sun':
            return <g><circle cx="90" cy="112" r="28" fill={stroke} opacity="0.9" />{Array.from({ length: 12 }, (_, i) => <line key={i} x1="90" y1="68" x2="90" y2="52" stroke={stroke} strokeWidth="5" strokeLinecap="round" transform={`rotate(${i * 30} 90 112)`} />)}</g>
        case 'moon':
            return <path d="M103 66c-29 9-43 42-26 68 10 15 28 25 45 22-13 15-37 17-55 4-24-17-30-51-13-75 11-16 30-25 49-19z" fill={stroke} opacity="0.9" />
        case 'star':
            return <polygon points="90,48 101,89 143,89 109,113 122,154 90,129 58,154 71,113 37,89 79,89" fill={stroke} opacity="0.9" />
        case 'tower':
            return <g><path d="M66 154h48l-7-88H73z" fill="none" stroke={stroke} strokeWidth="8" /><path d="M78 65l22-31-5 38 24-8-28 36 5-31z" fill="#ffe680" /></g>
        case 'wheel':
            return <g><circle cx="90" cy="112" r="48" fill="none" stroke={stroke} strokeWidth="8" />{Array.from({ length: 8 }, (_, i) => <line key={i} x1="90" y1="112" x2="90" y2="64" stroke={stroke} strokeWidth="4" transform={`rotate(${i * 45} 90 112)`} />)}<circle cx="90" cy="112" r="10" fill={stroke} /></g>
        case 'justice':
            return <g><line x1="90" y1="56" x2="90" y2="156" stroke={stroke} strokeWidth="6" /><line x1="52" y1="78" x2="128" y2="78" stroke={stroke} strokeWidth="5" /><path d="M52 82l-18 42h36zM128 82l-18 42h36z" fill="none" stroke={stroke} strokeWidth="4" /></g>
        case 'lovers':
            return <g><path d="M90 151C54 126 44 102 57 86c11-13 27-8 33 4 6-12 22-17 33-4 13 16 3 40-33 65z" fill={stroke} opacity="0.9" /></g>
        case 'death':
            return <g><path d="M56 154l68-92" stroke={stroke} strokeWidth="7" strokeLinecap="round" /><path d="M70 69c22-18 43-10 55 5" fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round" /><circle cx="72" cy="144" r="15" fill="none" stroke={stroke} strokeWidth="5" /></g>
        case 'world':
            return <g><circle cx="90" cy="112" r="46" fill="none" stroke={stroke} strokeWidth="7" /><path d="M52 112h76M90 66c17 21 17 71 0 92M90 66c-17 21-17 71 0 92" fill="none" stroke={stroke} strokeWidth="4" /></g>
        case 'chariot':
            return <g><path d="M54 72h72l-10 58H64z" fill="none" stroke={stroke} strokeWidth="7" /><circle cx="68" cy="150" r="10" fill={stroke} /><circle cx="112" cy="150" r="10" fill={stroke} /></g>
        case 'temperance':
            return <g><path d="M62 74h34v30H62zM84 119h34v30H84z" fill="none" stroke={stroke} strokeWidth="6" /><path d="M91 105c9 7 12 12 14 17" fill="none" stroke="#ffe680" strokeWidth="5" strokeLinecap="round" /></g>
        case 'devil':
            return <g><path d="M57 73l23 20 10-35 10 35 23-20-12 55H69z" fill="none" stroke={stroke} strokeWidth="7" /><circle cx="76" cy="117" r="5" fill={stroke} /><circle cx="104" cy="117" r="5" fill={stroke} /></g>
        case 'judgement':
            return <g><path d="M54 77l74-22-18 54-38 11z" fill="none" stroke={stroke} strokeWidth="7" /><path d="M72 122v35M108 112v45" stroke={stroke} strokeWidth="5" strokeLinecap="round" /></g>
        default:
            return <g><path d="M90 50l44 34v56l-44 34-44-34V84z" fill="none" stroke={stroke} strokeWidth="7" /><circle cx="90" cy="112" r="20" fill={stroke} opacity="0.78" /></g>
    }
}

export default function TarotCardArt({ card, hidden, position, matched, multiplier }) {
    const suit = card ? SUITS[card.suit] : null
    const color = suit?.color || '#b478ff'
    if (hidden) {
        return (
            <div className="tarot-card tarot-card-back-face">
                <svg viewBox="0 0 180 280" aria-hidden="true">
                    <rect x="8" y="8" width="164" height="264" rx="18" />
                    <path d="M36 68h108M36 212h108M54 52c27 24 45 24 72 0M54 228c27-24 45-24 72 0" />
                    <circle cx="90" cy="140" r="38" />
                    <text x="90" y="148">GP</text>
                </svg>
                <span className="tarot-card-position">{position}</span>
                <span className="tarot-hidden-label">Pull</span>
            </div>
        )
    }

    return (
        <div className={`tarot-card tarot-card-face ${matched ? 'matched' : ''}`} style={{ '--rarity': color }}>
            <svg viewBox="0 0 180 280" role="img" aria-label={`${position}: ${card.name}`}>
                <defs>
                    <linearGradient id={`tarot-bg-${card.id}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#321a4f" />
                        <stop offset="0.55" stopColor="#13091f" />
                        <stop offset="1" stopColor="#05020b" />
                    </linearGradient>
                </defs>
                <rect x="8" y="8" width="164" height="264" rx="18" fill={`url(#tarot-bg-${card.id})`} stroke={color} strokeWidth="3" />
                <rect x="18" y="18" width="144" height="244" rx="13" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
                <text x="28" y="39" className="tarot-svg-index">{card.number}</text>
                <text x="152" y="39" className="tarot-svg-suit">{suit.mark}</text>
                <Motif id={card.id} color={color} />
                <text x="90" y="206" className="tarot-svg-name">{card.name}</text>
                <text x="90" y="226" className="tarot-svg-keywords">{card.keywords}</text>
                <text x="90" y="250" className="tarot-svg-mult">x{multiplier.toFixed(2)}</text>
            </svg>
            <span className="tarot-card-position">{position}</span>
        </div>
    )
}
