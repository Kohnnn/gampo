export function normalizeSearchText(value) {
    return String(value || '').trim().toLowerCase()
}

export function searchGames(catalog = [], query = '', limit = 8) {
    const term = normalizeSearchText(query)
    if (!term) return []

    const tokens = term.split(/\s+/).filter(Boolean)
    return catalog
        .map(game => {
            const haystack = [
                game.name,
                game.id,
                game.path,
                game.category,
                game.volatility,
                game.hitFrequency,
            ].map(normalizeSearchText).join(' ')
            if (!tokens.every(token => haystack.includes(token))) return null
            const name = normalizeSearchText(game.name)
            const id = normalizeSearchText(game.id)
            const score = name === term ? 0
                : id === term ? 1
                    : name.startsWith(term) ? 2
                        : id.startsWith(term) ? 3
                            : haystack.includes(term) ? 4
                                : 5
            return { game, score }
        })
        .filter(Boolean)
        .sort((a, b) => a.score - b.score || a.game.name.localeCompare(b.game.name))
        .slice(0, limit)
        .map(({ game }) => game)
}
