import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mirrors = vi.hoisted(() => ({ pnl: vi.fn(), progress: vi.fn(), mission: vi.fn(), xp: vi.fn(), guard: vi.fn() }))
vi.mock('../../../hooks/useGlobalPnl', () => ({ recordPnl: mirrors.pnl }))
vi.mock('../../../hooks/useProgress', () => ({ recordRound: mirrors.progress }))
vi.mock('../../../hooks/useMissions', () => ({ recordMissionRound: mirrors.mission }))
vi.mock('../../../hooks/useXp', () => ({ recordXpRound: mirrors.xp }))
vi.mock('../../../hooks/useSessionGuard', () => ({ recordGuardRound: mirrors.guard }))
import useGameSession from './useGameSession'

let session
function Consumer({ gameId }) {
    session = useGameSession(gameId)
    return null
}

beforeEach(() => {
    vi.clearAllMocks()
    const store = new Map()
    vi.stubGlobal('localStorage', {
        getItem: key => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, String(value)),
    })
})

describe('useGameSession receipts', () => {
    it('persists retained record callbacks without a mounted renderer and keeps consecutive receipts', () => {
        renderToStaticMarkup(React.createElement(Consumer, { gameId: 'dice-deferred' }))
        const record = session.record
        record({ id: 'first', label: '10.00', profit: 4.9, betAmount: 5, multiplier: 1.98 })
        record({ id: 'second', label: '90.00', profit: -5, betAmount: 5, multiplier: 0 })
        expect(JSON.parse(localStorage.getItem('gampo_history_dice-deferred'))).toEqual([
            expect.objectContaining({ id: 'second', label: '90.00' }),
            expect.objectContaining({ id: 'first', label: '10.00' }),
        ])
        expect(mirrors.pnl).toHaveBeenCalledTimes(2)
        expect(mirrors.pnl).toHaveBeenNthCalledWith(1, { gameId: 'dice-deferred', label: '10.00', profit: 4.9, betAmount: 5 })
    })

    it('mirrors a receipt id once and clears the retained history before another record', () => {
        renderToStaticMarkup(React.createElement(Consumer, { gameId: 'dice-id' }))
        const entry = { id: 'same-round', label: '10.00', profit: 4.9, betAmount: 5, multiplier: 1.98 }
        session.record(entry)
        session.record(entry)
        for (const mirror of Object.values(mirrors)) expect(mirror).toHaveBeenCalledTimes(1)
        session.clear()
        session.record({ ...entry, id: 'new-round' })
        expect(JSON.parse(localStorage.getItem('gampo_history_dice-id'))).toEqual([expect.objectContaining({ id: 'new-round' })])
    })
})
