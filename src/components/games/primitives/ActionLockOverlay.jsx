// Soft action lock overlay shown over a game stage while a round runs.
//
// Goal: visible signal that input is locked without trapping the user.
// Pointer events pass through to the stage when interactive=true so games
// like Mines/Plinko can still receive runtime clicks for their own
// in-round controls (e.g. cashout). When interactive=false (default), the
// overlay swallows pointer events.
//
// Usage:
//   <ActionLockOverlay active={running} label="Rolling..." />

export default function ActionLockOverlay({
    active = false,
    label = '',
    interactive = false,
    className = '',
}) {
    if (!active) return null
    return (
        <div
            className={`action-lock ${interactive ? 'pass' : 'block'} ${className}`}
            aria-hidden={!label}
        >
            {label ? <span className="action-lock-label">{label}</span> : null}
        </div>
    )
}
