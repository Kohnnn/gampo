export function deriveSportsbookEnergy({ events = [], marquee = null, feedSource = 'fallback' } = {}) {
    const list = Array.isArray(events) ? events : []
    const liveEvents = list.filter(event => event.status === 'live')
    const marqueeEvents = list.filter(event => event.tags?.includes('marquee') || Number(event.marquee?.score) >= 60)
    const estimatedEvents = list.filter(event => event.tags?.includes('estimated-odds') || event.oddsMode === 'estimated')
    const movingSelections = list.reduce((sum, event) => sum + countMovingSelections(event), 0)
    const feedLive = feedSource === 'live' || feedSource === 'blended'
    const skipped = Number(marquee?.skippedCount) || 0
    const shown = Number(marquee?.shownCount) || list.length

    const score = Math.min(100,
        liveEvents.length * 18
        + marqueeEvents.length * 12
        + movingSelections * 4
        + (feedLive ? 14 : 0)
        + Math.min(12, skipped > 0 ? 8 : 0),
    )

    const label = score >= 75 ? 'Big-match night'
        : score >= 45 ? 'Market warming up'
            : feedLive ? 'Feed watch'
                : 'Practice board'

    const note = score >= 75 ? 'Live, famous, or fast-moving boards are clustered first so the sportsbook feels event-led.'
        : score >= 45 ? 'Odds movement and marquee filters are active. Watch price changes before placing practice tickets.'
            : feedLive ? 'Real-event feed is connected, but the current slate is quiet.'
                : 'Synthetic fallback keeps the practice sportsbook playable while providers are unavailable.'

    return {
        score,
        label,
        note,
        liveCount: liveEvents.length,
        marqueeCount: marqueeEvents.length || Number(marquee?.marqueeCount) || 0,
        estimatedCount: estimatedEvents.length,
        movingSelections,
        skippedCount: skipped,
        shownCount: shown,
        feedLive,
    }
}

function countMovingSelections(event) {
    return (event.marketGroups || []).reduce((sum, group) => (
        sum + (group.selections || []).filter(selection => selection.trend === 'up' || selection.trend === 'down' || selection.movement).length
    ), 0)
}
