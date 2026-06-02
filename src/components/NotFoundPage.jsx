// 404 fallback page rendered for any route not registered in App.jsx.
// Replaces React Router's blank-screen behaviour when the user navigates to
// a path like /casinowar that doesn't match a real route.

import { Link, useLocation } from 'react-router-dom'

function routeContext(pathname) {
    if (pathname.startsWith('/sportsbook') || pathname.startsWith('/sports')) {
        return {
            title: 'Sportsbook route not found',
            copy: 'This sportsbook view is not available. Open the sportsbook home or browse all events.',
            actions: [
                ['Open Sportsbook', '/sportsbook'],
                ['All Events', '/sportsbook/all'],
            ],
        }
    }
    if (pathname.includes('slot')) {
        return {
            title: 'Slot route not found',
            copy: 'This slot path is not registered. Open the slot factory or browse the slot lobby.',
            actions: [
                ['Open Slot Factory', '/slots'],
                ['Browse Slots', '/slots-lobby'],
            ],
        }
    }
    if (pathname.includes('vip') || pathname.includes('academy') || pathname.includes('mission')) {
        return {
            title: 'Progress route not found',
            copy: 'This progress page moved. Use the current VIP, missions, or risk academy links.',
            actions: [
                ['Risk Academy', '/learn'],
                ['VIP Lab', '/vip'],
            ],
        }
    }
    return {
        title: 'Game not found',
        copy: "The route you followed doesn't exist. Try the lobby or pick a game from the sidebar.",
        actions: [
            ['Back to lobby', '/'],
            ['Browse Originals', '/originals'],
        ],
    }
}

export default function NotFoundPage() {
    const location = useLocation()
    const content = routeContext(location.pathname)
    return (
        <section className="not-found" data-route-fallback>
            <h1>{content.title}</h1>
            <p>{content.copy}</p>
            <div className="not-found-actions">
                {content.actions.map(([label, to], index) => (
                    <Link key={to} className={`bp-bet-btn ${index === 0 ? 'active' : ''}`} to={to}>{label}</Link>
                ))}
            </div>
        </section>
    )
}
