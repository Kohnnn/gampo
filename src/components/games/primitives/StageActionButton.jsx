// Shared in-stage progression CTA (Hit/Stand, Climb, Cross, Draw, ...).
// Guarantees a 44px min hit target, accent gradient, and a consistent
// focus-visible ring across all games. Variants: primary | danger | secondary.

export default function StageActionButton({
    children,
    onClick,
    disabled,
    variant = 'primary',
    className = '',
    ...rest
}) {
    const classes = [
        'stage-action-btn',
        variant !== 'primary' ? variant : '',
        className,
    ].filter(Boolean).join(' ')
    return (
        <button type="button" className={classes} onClick={onClick} disabled={disabled} {...rest}>
            {children}
        </button>
    )
}
