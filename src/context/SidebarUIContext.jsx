import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Shell chrome state shared between Layout (which owns the state) and the
// Header (which renders the mobile menu button).
//
// Below 769px the sidebar is an off-canvas drawer, so it needs an affordance
// that is actually visible: previously its only toggle lived *inside* the
// sidebar, which is `display:none` at that width — an unreachable control for
// an unreachable menu. This context gives the Header a real button.
//
// This is presentation state only. It grants no access to credits, RNG,
// tickets or any economic behaviour.
const SidebarUIContext = createContext(null)

const KEY = 'gampo_sidebar_open'

function readInitial() {
    try {
        const raw = localStorage.getItem(KEY)
        if (raw === '0') return false
        if (raw === '1') return true
    } catch { /* ignore */ }
    return true
}

export function SidebarUIProvider({ children }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(readInitial)

    useEffect(() => {
        try { localStorage.setItem(KEY, isSidebarOpen ? '1' : '0') } catch { /* ignore */ }
    }, [isSidebarOpen])

    const toggleSidebar = useCallback(() => setIsSidebarOpen(v => !v), [])
    // Navigating away should not leave the mobile drawer covering the game.
    const closeSidebar = useCallback(() => setIsSidebarOpen(false), [])

    const value = useMemo(
        () => ({ isSidebarOpen, toggleSidebar, closeSidebar }),
        [isSidebarOpen, toggleSidebar, closeSidebar],
    )

    return <SidebarUIContext.Provider value={value}>{children}</SidebarUIContext.Provider>
}

export function useSidebarUI() {
    const ctx = useContext(SidebarUIContext)
    // Header is rendered inside the provider; guard is for isolated tests.
    return ctx || { isSidebarOpen: true, toggleSidebar: () => {}, closeSidebar: () => {} }
}
