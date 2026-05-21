// 404 fallback page rendered for any route not registered in App.jsx.
// Replaces React Router's blank-screen behaviour when the user navigates to
// a path like /casinowar that doesn't match a real route.

import { Link } from 'react-router-dom'

export default function NotFoundPage() {
    return (
        <section className="not-found">
            <h1>Game not found</h1>
            <p>The route you followed doesn't exist. Try the lobby or pick a game from the sidebar.</p>
            <div className="not-found-actions">
                <Link className="bp-bet-btn active" to="/">Back to lobby</Link>
                <Link className="bp-bet-btn" to="/originals">Browse Originals</Link>
            </div>
        </section>
    )
}
