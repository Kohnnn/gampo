// QA037: Cases rendered every item's artwork as a bare <img loading="lazy">.
// A failed request left a broken box with no identity — for a drop result that
// means the player cannot tell what they received.
//
// This wrapper keeps the same <img> (same attributes, same layout) and swaps in
// a labelled fallback on error. It reports the failure once per element, not per
// render, and never hides the item's name: the callers render the name beside
// it, and the fallback repeats the initial as a visual anchor.
import { useState } from 'react'

export default function CaseArt({ src, alt = '', className = '', style, ...rest }) {
    // Keyed by source, not a bare boolean: the selected-case slot reuses this
    // component as `activeCase` changes, and a sticky flag would let one broken
    // image permanently mask every later valid one.
    const [failedSrc, setFailedSrc] = useState(null)
    const failed = failedSrc !== null && failedSrc === src
    if (failed || !src) {
        return (
            <span
                className={`cases-art-fallback ${className}`.trim()}
                style={style}
                role="img"
                aria-label={alt ? `${alt} (artwork unavailable)` : 'Artwork unavailable'}
                data-case-art-fallback="true"
            >
                {(alt || '?').slice(0, 1).toUpperCase()}
            </span>
        )
    }
    return (
        <img
            src={src}
            alt={alt}
            className={className}
            style={style}
            loading="lazy"
            onError={() => setFailedSrc(src)}
            data-case-art="true"
            {...rest}
        />
    )
}
