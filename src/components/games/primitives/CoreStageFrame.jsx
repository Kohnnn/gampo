// Fixed-aspect stage frame so animations and labels don't resize the page
// during play. Per implementation guide section 4: "Add stable stage
// dimensions per game so animations and labels do not resize the page
// during play."
//
// Usage:
//   <CoreStageFrame aspect="16/9" minHeight={420}>...</CoreStageFrame>
//   <CoreStageFrame width={720} height={420}>...</CoreStageFrame>
//
// The frame keeps its aspect-ratio at all viewport widths and provides a
// `loading` slot for preloader skeletons that mount before the stage is
// fully ready.

export default function CoreStageFrame({
    aspect,
    minHeight,
    maxWidth,
    width,
    height,
    loading = false,
    loadingNode,
    children,
    className = '',
    backdrop,
    mobileScrollable = false,
}) {
    const style = {}
    if (aspect) style.aspectRatio = aspect
    if (minHeight) {
        style['--core-stage-min-height'] = `${minHeight}px`
        style.minHeight = `min(${minHeight}px, calc(100dvh - 220px))`
    }
    if (maxWidth) style.maxWidth = `${maxWidth}px`
    if (width) style.width = `${width}px`
    if (height) style.height = `${height}px`
    if (backdrop) style.backgroundImage = `url("${backdrop}")`
    const classes = [
        'core-stage',
        loading ? 'is-loading' : '',
        mobileScrollable ? 'core-stage-mobile-scroll' : '',
        className,
    ].filter(Boolean).join(' ')
    return (
        <div className={classes} style={style} data-game-stage data-mobile-scroll-surface={mobileScrollable || undefined} data-ux-surface="stage">
            {loading ? (
                <div className="core-stage-loading">
                    {loadingNode || <DefaultLoader />}
                </div>
            ) : null}
            <div className="core-stage-body" aria-busy={loading}>
                {children}
            </div>
        </div>
    )
}

function DefaultLoader() {
    return (
        <div className="core-stage-skeleton">
            <span className="core-stage-spinner" />
            <span className="core-stage-skeleton-label">Loading stage...</span>
        </div>
    )
}
