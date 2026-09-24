import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatDock from './ChatDock'
import AchievementToast from './AchievementToast'
import MissionToast from './MissionToast'
import MobileBottomNav from './MobileBottomNav'
import SessionGuardBanner from './SessionGuardBanner'
import WelcomeModal from './WelcomeModal'
import FooterDisclaimer from './FooterDisclaimer'
import { useMenuBgm } from '../audio/useBgm'
import { playSample } from '../audio/audioContext'
import { useSettings } from '../hooks/useSettings'
import { SidebarUIProvider, useSidebarUI } from '../context/SidebarUIContext'

// Lobby/menu surfaces that should play the menu loop. Anything not in this
// set is treated as an in-game route (which plays its own BGM via useBgm /
// useGameBgm) so the two music sources never overlap.
const LOBBY_PATHS = new Set([
    '/', '/originals', '/slots-lobby', '/live', '/missions', '/vip',
    '/learn', '/activity', '/verify', '/race', '/promotions', '/collections',
])

function LayoutShell() {
    const { isSidebarOpen, toggleSidebar, closeSidebar } = useSidebarUI()
    const location = useLocation()

    // Subscribe to display settings so accent/density/reduce-motion stay applied
    // to <html> across navigation (applySettingsToDom runs on mount + change).
    useSettings()

    // Play lobby music only on menu surfaces; in-game routes own their BGM.
    useMenuBgm(LOBBY_PATHS.has(location.pathname))

    // Navigating away should not leave the mobile drawer covering the game.
    useEffect(() => { closeSidebar() }, [location.pathname, closeSidebar])

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
            <SessionGuardBanner />
            <WelcomeModal />
            <FooterDisclaimer />
        </div>
    )
}

// The provider owns the sidebar state so both the Sidebar and the Header's
// mobile menu button can reach it.
function Layout() {
    return (
        <SidebarUIProvider>
            <LayoutShell />
        </SidebarUIProvider>
    )
}

export default Layout
