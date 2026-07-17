export function classifyPage(snapshot = {}) {
    const { ready, rootChildren = 0, routeErrors = [], requiredContent = false } = snapshot
    const reasons = []
    if (ready !== true) reasons.push({ code: 'not-ready', message: 'page did not reach ready state' })
    if (!Number.isFinite(rootChildren) || rootChildren < 1) reasons.push({ code: 'empty-root', message: 'application root has no rendered children' })
    if (!Array.isArray(routeErrors) || routeErrors.filter(Boolean).length > 0) reasons.push({ code: 'route-error', message: 'route error rendered', routeErrors })
    if (requiredContent !== true) reasons.push({ code: 'missing-content', message: 'required route content is missing' })
    return { ok: reasons.length === 0, reasons }
}

export function isFailure(snapshot) {
    return !classifyPage(snapshot).ok
}

export async function assertBaseReachable(baseUrl) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3500)
    try {
        const response = await fetch(baseUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
    } catch (error) {
        const detail = error?.name === 'AbortError' ? 'request timed out' : error?.message || String(error)
        throw new Error(`Base URL is not reachable: ${baseUrl} (${detail})`)
    } finally {
        clearTimeout(timeout)
    }
}
