// Stake-style segmented mode tabs (Manual / Auto / Strategy or any custom set).
//
// Used as the per-game top-of-panel tab strip with strong active state and
// fixed height so layout doesn't shift between modes.

export default function SegmentedModeTabs({
    options = [],
    value,
    onChange,
    className = '',
    size = 'md',
    ariaLabel = 'Mode options',
}) {
    return (
        <div className={`seg-tabs seg-${size} ${className}`} role="tablist" aria-label={ariaLabel}>
            {options.map(opt => {
                const id = typeof opt === 'string' ? opt : opt.value
                const label = typeof opt === 'string' ? opt : (opt.label || opt.value)
                const icon = typeof opt === 'object' ? opt.icon : null
                const disabled = typeof opt === 'object' ? !!opt.disabled : false
                const active = value === id
                return (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        disabled={disabled}
                        className={`seg-tab ${active ? 'active' : ''}`}
                        onClick={() => !disabled && onChange && onChange(id)}
                    >
                        {icon ? <span className="seg-tab-icon">{icon}</span> : null}
                        <span className="seg-tab-label">{label}</span>
                    </button>
                )
            })}
        </div>
    )
}
