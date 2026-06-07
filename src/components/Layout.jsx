import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatDock from './ChatDock'
import AchievementToast from './AchievementToast'
import MissionToast from './MissionToast'
import MobileBottomNav from './MobileBottomNav'
import { useMenuBgm } from '../audio/useBgm'
import { playSample } from '../audio/audioContext'

const SIDEBAR_KEY = 'gampo_sidebar_open'

// Lobby/menu surfaces that should play the menu loop. Anything not in this
// set is treated as an in-game route (which plays its own BGM via useBgm /
// useGameBgm) so the two music sources never overlap.
const LOBBY_PATHS = new Set([
    '/', '/originals', '/slots-lobby', '/live', '/missions', '/vip',
    '/learn', '/activity', '/verify', '/race', '/promotions', '/collections',
])

function readInitialSidebar() {
    try {
        const raw = localStorage.getItem(SIDEBAR_KEY)
        if (raw === '0') return false
        if (raw === '1') return true
    } catch { /* ignore */ }
    return true
}

function Layout() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(readInitialSidebar)
    const location = useLocation()

    // Play lobby music only on menu surfaces; in-game routes own their BGM.
    useMenuBgm(LOBBY_PATHS.has(location.pathname))

    useEffect(() => {
        try { localStorage.setItem(SIDEBAR_KEY, isSidebarOpen ? '1' : '0') } catch { /* ignore */ }
    }, [isSidebarOpen])

    // Lobby UI click feedback. Delegated listener plays a soft click when a
    // button/link/tile is activated on menu surfaces. Honors SFX/master mute
    // automatically (playSample checks the buses).
    useEffect(() => {
        if (!LOBBY_PATHS.has(location.pathname)) return undefined
        const onClick = (event) => {
            const el = event.target.closest('a, button, [role="button"], .game-tile, [data-game-tile]')
            if (!el) return
            playSample('/audio/common/click.wav', { volume: 0.4, dedupeKey: 'menu-click' })
        }
        document.addEventListener('click', onClick)
        return () => document.removeEventListener('click', onClick)
    }, [location.pathname])

    const toggleSidebar = () => {
        setIsSidebarOpen(value => !value)
    }

    return (
        <div className="app-layout" data-ux-surface="shell">
            <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            <div className="app-main-wrapper" data-ux-surface="shell">
                <Header />
                <main className="main-content" data-ux-surface="stage">
                    <Outlet />
                </main>
            </div>
            <ChatDock />
            <MobileBottomNav />
            <AchievementToast />
            <MissionToast />
        </div>
    )
}

export default Layout
