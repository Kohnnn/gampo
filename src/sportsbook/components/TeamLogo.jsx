function TeamLogo({ src, label, className = '' }) {
    const initials = String(label || '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0])
        .join('')
        .toUpperCase()

    return (
        <span className={`sb-team-logo ${src ? 'has-image' : 'is-blank'} ${className}`.trim()} aria-hidden="true">
            {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span>{initials}</span>}
        </span>
    )
}

export default TeamLogo
