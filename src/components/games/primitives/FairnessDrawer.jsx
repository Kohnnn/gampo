// Single shared fairness drawer used by every game via GameShell.titleBarExtras.
// Replaces the bespoke fairness modals scattered across legacy games.
//
// Reads / mutates the seed state from `src/utils/fairRng.js`. Shows:
//   - server-seed hash (rotation pending vs revealed)
//   - client seed (editable)
//   - nonce
//   - last 12 rolls with HMAC trail
//   - a "Rotate seeds" button that reveals the active server seed before rotating

import { useEffect, useMemo, useState } from 'react'
import { Shield, X, RotateCw } from 'lucide-react'
import {
    getProvablyFair,
    rotateSeeds,
    setClientSeed,
    getRecentRolls,
    maskSeed,
} from '../../../utils/fairRng'

export default function FairnessDrawer({ open, onClose }) {
    const [state, setState] = useState(() => getProvablyFair())
    const [recent, setRecent] = useState(() => getRecentRolls())
    const [draftClient, setDraftClient] = useState(state.clientSeed)
    const [revealed, setRevealed] = useState(null)

    useEffect(() => {
        if (!open) return
        setState(getProvablyFair())
        setRecent(getRecentRolls())
        const interval = window.setInterval(() => setRecent(getRecentRolls()), 1500)
        return () => window.clearInterval(interval)
    }, [open])

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const masked = useMemo(() => maskSeed(state.serverSeed), [state.serverSeed])

    const applyClient = () => {
        const next = setClientSeed(draftClient)
        setState(next)
    }

    const rotate = () => {
        setRevealed(state.serverSeed)
        const next = rotateSeeds(draftClient)
        setState(next)
        setDraftClient(next.clientSeed)
    }

    if (!open) return null

    return (
        <div className="fair-drawer-backdrop" onClick={onClose}>
            <aside className="fair-drawer" role="dialog" aria-label="Provably-fair drawer" onClick={e => e.stopPropagation()}>
                <header className="fair-drawer-head">
                    <h2><Shield size={16} /> Provably Fair</h2>
                    <button className="fair-close" onClick={onClose} aria-label="Close fairness drawer"><X size={16} /></button>
                </header>

                <section className="fair-section">
                    <label>Active server seed (hash)</label>
                    <code className="fair-mono">{masked || '—'}</code>
                    <small>The full seed is revealed when you rotate.</small>
                </section>

                {revealed && (
                    <section className="fair-section fair-revealed">
                        <label>Previous server seed (revealed)</label>
                        <code className="fair-mono fair-revealed-seed">{revealed}</code>
                    </section>
                )}

                <section className="fair-section">
                    <label>Client seed</label>
                    <div className="fair-row">
                        <input value={draftClient} onChange={e => setDraftClient(e.target.value)} />
                        <button onClick={applyClient}>Save</button>
                    </div>
                </section>

                <section className="fair-section">
                    <label>Nonce</label>
                    <code className="fair-mono">{state.nonce}</code>
                </section>

                <section className="fair-section">
                    <button className="fair-rotate" onClick={rotate}><RotateCw size={14} /> Rotate seeds</button>
                    <small>Rotation reveals the current server seed for verification and starts a new pair.</small>
                </section>

                <section className="fair-section">
                    <label>Recent rolls</label>
                    {recent.length === 0 ? (
                        <small>None yet. Play a round and check back.</small>
                    ) : (
                        <ul className="fair-recent">
                            {recent.slice(0, 12).map(r => (
                                <li key={r.id}>
                                    <span className="fair-recent-game">{r.gameId}</span>
                                    <span className="fair-recent-nonce">#{r.nonce}</span>
                                    <span className="fair-recent-roll">{(r.roll * 100).toFixed(2)}%</span>
                                    <code className="fair-recent-hmac" title={r.hmac || ''}>
                                        {r.hmac ? `${r.hmac.slice(0, 10)}…` : '—'}
                                    </code>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <footer className="fair-drawer-foot">
                    <small>Educational only. No real money is wagered or paid out.</small>
                </footer>
            </aside>
        </div>
    )
}
