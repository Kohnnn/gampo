// One-time migration: rename localStorage keys, migrating history from
// gampo_history_{game}-shell -> gampo_history_{game}
// Run once: node scripts/migrateGameSessionIds.cjs
const MIGRATIONS = [
    { old: 'gampo_history_crash-shell',     new: 'gampo_history_crash'     },
    { old: 'gampo_history_plinko-shell',    new: 'gampo_history_plinko'   },
    { old: 'gampo_history_mines-shell',     new: 'gampo_history_mines'    },
    { old: 'gampo_history_dino-shell',      new: 'gampo_history_dino'     },
    { old: 'gampo_history_blackjack-shell', new: 'gampo_history_blackjack' },
]

MIGRATIONS.forEach(({ old, new: next }) => {
    try {
        const raw = localStorage.getItem(old)
        if (!raw) {
            console.log(`No data at ${old} — skipping`)
            return
        }
        const oldData = JSON.parse(raw)
        const existingRaw = localStorage.getItem(next)
        const existing = existingRaw ? JSON.parse(existingRaw) : []
        const merged = [...oldData, ...existing].slice(0, 200)
        localStorage.setItem(next, JSON.stringify(merged))
        localStorage.removeItem(old)
        console.log(`Migrated: ${old} -> ${next} (${oldData.length} entries merged)`)
    } catch (e) {
        console.error(`Failed ${old}:`, e)
    }
})

console.log('Done.')
