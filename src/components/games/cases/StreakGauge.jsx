// StreakGauge — last 10 drops rendered as rarity-colored slots.
//
// Data shape: each drop is `{ color, rarity, valueGc, multiplier, key, ts, dropId }`.
// Slots are ordered oldest (left) → newest (right). When a new drop lands, it
// animates in via a slide-from-top + opacity fade. Empty slots are dashed.
//
// The component is purely visual; it does not call `playSound` or `haptic`.
// Reduced-motion users get a static fade instead of a slide.

import { useEffect, useRef, useState } from 'react'

const SLOT_COUNT_DESKTOP = 10
const SLOT_COUNT_MOBILE = 8
const MOBILE_QUERY = '(max-width: 768px)'

function readSlotCount() {
    if (typeof window === 'undefined' || !window.matchMedia) return SLOT_COUNT_DESKTOP
    return window.matchMedia(MOBILE_QUERY).matches ? SLOT_COUNT_MOBILE : SLOT_COUNT_DESKTOP
}

function describeDrop(slot, index, total) {
    if (!slot) return ''
    const position = index + 1
    const rarity = slot.rarity || 'Drop'
    const mult = Number.isFinite(slot.multiplier)
        ? ` (${slot.multiplier.toFixed(2)}\u00d7)`
        : (Number.isFinite(slot.valueGc) ? ` (${slot.valueGc.toFixed(2)} GC)` : '')
    return `Drop ${position}: ${rarity}${mult}`
}

export default function StreakGauge({ drops = [], className = '' }) {
    const [slotCount, setSlotCount] = useState(() => readSlotCount())
    const reduceMotionRef = useRef(false)
    const lastDropIdRef = useRef(null)
    const [freshSlot, setFreshSlot] = useState(-1)

    useEffect(() => {
        setSlotCount(readSlotCount())
        if (typeof window === 'undefined' || !window.matchMedia) return undefined
        const mql = window.matchMedia(MOBILE_QUERY)
        const onChange = () => setSlotCount(mql.matches ? SLOT_COUNT_MOBILE : SLOT_COUNT_DESKTOP)
        mql.addEventListener?.('change', onChange)
        return () => mql.removeEventListener?.('change', onChange)
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return
        reduceMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }, [])

    useEffect(() => {
        if (!drops.length) return
        const newest = drops[0]
        const id = newest.dropId || newest.key || `${newest.ts || ''}-${drops.length}`
        if (lastDropIdRef.current === id) return
        lastDropIdRef.current = id
        setFreshSlot(0)
        const timer = setTimeout(() => setFreshSlot(-1), reduceMotionRef.current ? 80 : 320)
        return () => clearTimeout(timer)
    }, [drops])

    if (!drops.length) return null

    const slots = Array.from({ length: slotCount }, (_, idx) => drops[idx] || null)

    return (
        <section
            className={`cases-streak ${className}`.trim()}
            aria-label="Last 10 case drops"
            data-ux-surface="controls"
        >
            <header className="cases-streak-head">
                <strong>Streak</strong>
                <small>last {slots.length} drops · newest on the right</small>
            </header>
            <ol
                className="cases-streak-bar"
                role="list"
                data-streak-count={slotCount}
            >
                {slots.map((slot, idx) => {
                    const isFresh = idx === freshSlot
                    const total = slots.length
                    return (
                        <li
                            key={`streak-${idx}-${slot?.dropId || slot?.key || 'empty'}`}
                            className={`cases-streak-slot${slot ? ' is-filled' : ' is-empty'}${isFresh ? ' is-fresh' : ''}`}
                            style={slot?.color ? { '--rarity': slot.color } : undefined}
                            aria-label={describeDrop(slot, idx, total)}
                            data-slot-index={idx}
                            data-slot-rarity={slot?.rarity || 'empty'}
                        >
                            {slot ? (
                                <span className="cases-streak-slot-fill" aria-hidden="true" />
                            ) : (
                                <span className="cases-streak-slot-empty" aria-hidden="true" />
                            )}
                        </li>
                    )
                })}
            </ol>
        </section>
    )
}