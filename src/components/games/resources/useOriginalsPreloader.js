// React hook that preloads a game's critical resources before the stage
// becomes interactive. Returns:
//   { ready, missing, errors, urlFor(role) }
//
// `ready` becomes true once every critical resource resolves OR every
// critical resource is reported missing in the manifest (manifest declares
// no path => fall through to defaults). Optional resources never block
// `ready`.
//
// Behavior:
//   - Builds an Image() per critical raster role; resolves on load/error.
//   - Logs warnings for missing optional resources.
//   - Logs errors for missing critical resources.
//   - Falls through cleanly when the manifest has no entry for the slug.

import { useEffect, useMemo, useState } from 'react'
import { originalsManifest, resolveRole } from './originalsManifest'
import { classifyRole } from './resourceRoles'

function imagePromise(url, timeoutMs = 4500) {
    return new Promise(resolve => {
        if (!url) { resolve({ url, ok: false }); return }
        const img = new Image()
        let settled = false
        const finish = (ok) => {
            if (settled) return
            settled = true
            resolve({ url, ok })
        }
        const timer = window.setTimeout(() => finish(false), timeoutMs)
        img.onload = () => {
            window.clearTimeout(timer)
            finish(true)
        }
        img.onerror = () => {
            window.clearTimeout(timer)
            finish(false)
        }
        img.src = url
    })
}

export function useOriginalsPreloader(slug) {
    const entry = originalsManifest[slug] || null

    const requested = useMemo(() => {
        if (!entry) return []
        const roles = Array.isArray(entry.preload) ? entry.preload.slice() : []
        return roles.map(role => ({ role, url: resolveRole(slug, role), kind: classifyRole(role) }))
    }, [slug, entry])

    const [ready, setReady] = useState(requested.length === 0)
    const [missing, setMissing] = useState([])
    const [errors, setErrors] = useState([])

    useEffect(() => {
        let cancelled = false
        if (requested.length === 0) {
            setReady(true)
            setMissing([])
            setErrors([])
            return () => { cancelled = true }
        }
        const critical = requested.filter(r => r.kind === 'critical')
        const optional = requested.filter(r => r.kind === 'optional')
        // Warn about optional resources without a path.
        optional.forEach(r => {
            if (!r.url) {
                // eslint-disable-next-line no-console
                console.warn(`[useOriginalsPreloader] optional asset missing for ${slug}:${r.role}`)
            }
        })
        // Error for critical resources without a path.
        const missingCritical = critical.filter(r => !r.url).map(r => r.role)
        if (missingCritical.length > 0) {
            // eslint-disable-next-line no-console
            console.error(`[useOriginalsPreloader] critical assets missing for ${slug}:`, missingCritical)
        }
        const promises = critical.filter(r => r.url).map(r => imagePromise(r.url).then(res => ({ ...r, ...res })))
        Promise.all(promises).then(results => {
            if (cancelled) return
            const failed = results.filter(r => !r.ok).map(r => r.role)
            setErrors(failed)
            setMissing(missingCritical)
            setReady(true)
        })
        return () => { cancelled = true }
    }, [slug, requested])

    return {
        ready,
        missing,
        errors,
        urlFor: role => resolveRole(slug, role),
    }
}
