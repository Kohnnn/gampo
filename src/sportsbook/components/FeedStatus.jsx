// QA042: the feed status block is dumb presentation so all four feed states
// (current/stale/empty/error) can be rendered and asserted without mounting the
// whole shell, which needs a router, credit context and localStorage.
// The markup shape is load bearing: the CSS grid gives the reading `<div>` the
// `minmax(0, 1fr)` track and the `<dl>` the shrinkable `auto` track.
export default function FeedStatus({ presentation }) {
    return (
        <section className={`sb-feed-status is-${presentation.state}`} role="status" aria-live="polite" aria-atomic="true">
            <div><strong>{presentation.heading}</strong><span id="sportsbook-feed-status-copy">{presentation.body}</span></div>
            <dl>
                <div><dt>Last refresh</dt><dd>{presentation.refreshed}</dd></div>
                <div><dt>Sources</dt><dd>{presentation.sources.join(', ') || 'No attributable source'}</dd></div>
            </dl>
        </section>
    )
}
