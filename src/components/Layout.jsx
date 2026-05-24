import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Sidebar from './Sidebar'
import ChatDock from './ChatDock'
import AchievementToast from './AchievementToast'

const SIDEBAR_KEY = 'gampo_sidebar_open'

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

    useEffect(() => {
        try { localStorage.setItem(SIDEBAR_KEY, isSidebarOpen ? '1' : '0') } catch { /* ignore */ }
    }, [isSidebarOpen])

    const toggleSidebar = () => {
        setIsSidebarOpen(value => !value)
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
            <div className="app-main-wrapper">
                <Header />
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
            <ChatDock />
            <AchievementToast />
        </div>
    )
}

export default Layout
