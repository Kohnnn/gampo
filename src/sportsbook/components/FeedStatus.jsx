// QA042 (#37): the feed status block is presentation-only so all four states
// can be rendered without mounting the shell, router, credit context or storage.
// CSS gives the reading `<div>` a flexible track and caps metadata in the
// desktop split; the phone layout stacks copy above that wrapped metadata.
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
