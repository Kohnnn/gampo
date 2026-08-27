import { useRef, useEffect } from 'react'

const owners = new WeakMap()
const refOwners = new WeakMap()

function cleanup(ref) {
    const owned = refOwners.get(ref)
    if (!owned || owners.get(owned.el)?.token !== owned.token) return
    if (typeof window !== 'undefined' && owned.timer != null) window.clearTimeout(owned.timer)
    owned.el.classList.remove('gampo-shake', 'gampo-shake-lg')
    owners.delete(owned.el)
    refOwners.delete(ref)
}

export function useTremor() {
    const ref = useRef(null)
    useEffect(() => () => cleanup(ref), [ref])
    return ref
}

export function triggerTremor(ref, size = 'sm') {
    const el = ref?.current
    if (!el || typeof window === 'undefined' || typeof document === 'undefined') return
    if (document.documentElement?.classList?.contains('gampo-reduce-motion')) return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const previous = owners.get(el)
    if (previous?.timer != null) window.clearTimeout(previous.timer)
    el.classList.remove('gampo-shake', 'gampo-shake-lg')
    void el.offsetWidth

    const token = {}
    const owner = { token, timer: null }
    const cls = size === 'lg' ? 'gampo-shake-lg' : 'gampo-shake'
    owners.set(el, owner)
    refOwners.set(ref, { el, token, timer: null })
    el.classList.add(cls)
    const timer = window.setTimeout(() => {
        if (owners.get(el)?.token !== token) return
        el.classList.remove('gampo-shake', 'gampo-shake-lg')
        owners.delete(el)
        if (refOwners.get(ref)?.token === token) refOwners.delete(ref)
    }, size === 'lg' ? 700 : 400)
    owner.timer = timer
    refOwners.set(ref, { el, token, timer })
}
