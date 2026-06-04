import { MessageCircle, GraduationCap, Home, Trophy, Gamepad2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
    { id: 'home', label: 'Home', path: '/', icon: Home, match: pathname => pathname === '/' },
    { id: 'games', label: 'Games', path: '/originals', icon: Gamepad2, match: pathname => pathname === '/originals' || pathname.startsWith('/slots') || pathname.startsWith('/collections') },
    { id: 'sportsbook', label: 'Sports', path: '/sportsbook', icon: Trophy, match: pathname => pathname.startsWith('/sportsbook') || pathname.startsWith('/sports') },
    { id: 'learn', label: 'Learn', path: '/learn', icon: GraduationCap, match: pathname => pathname.startsWith('/learn') || pathname.startsWith('/missions') || pathname.startsWith('/vip') },
]

function MobileBottomNav() {
    const location = useLocation()

    const openChat = () => {
        document.dispatchEvent(new CustomEvent('gampo:open-chat', { detail: { tab: 'chat' } }))
    }

    return (
        <nav className="mobile-bottom-nav" data-mobile-bottom-nav aria-label="Mobile primary navigation">
            {navItems.map(item => {
                const Icon = item.icon
                const active = item.match(location.pathname)
                return (
                    <Link
                        key={item.id}
                        to={item.path}
                        className={active ? 'active' : ''}
                        aria-current={active ? 'page' : undefined}
                    >
                        <Icon size={19} />
                        <span>{item.label}</span>
                    </Link>
                )
            })}
            <button type="button" onClick={openChat}>
                <MessageCircle size={19} />
                <span>Chat</span>
            </button>
        </nav>
    )
}

export default MobileBottomNav
