// QA008 — the Plinko canvas backing store must match the rendered box × DPR and
// follow resizes/DPR changes, instead of being frozen at mount size.
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import PlinkoEngine from './engine/PlinkoEngine'
import { FRAME, clampDpr, plinkoBackingSize } from './frameSize'

function fakeCanvas(cssWidth, cssHeight) {
    const context = { setTransform: vi.fn(), drawImage: vi.fn(), scale: vi.fn() }
    const canvas = {
        width: 300,
        height: 150,
        clientWidth: cssWidth,
        clientHeight: cssHeight,
        style: {},
        getContext: () => context,
        getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight }),
    }
    return { canvas, context }
}

describe('Plinko canvas backing store (QA008)', () => {
    it('sizes the buffer to CSS size × DPR, not to model size × DPR', () => {
        vi.stubGlobal('window', { devicePixelRatio: 2 })
        const { canvas } = fakeCanvas(380, 285)
        const engine = new PlinkoEngine(canvas, { rowCount: 12 })
        engine.stop()

        expect(canvas.width).toBe(760)
        expect(canvas.height).toBe(570)
        // Display size stays CSS-driven; the engine must not write inline sizes.
        expect(canvas.style.width).toBeUndefined()
        vi.unstubAllGlobals()
    })

    it.each([
        [380, 285, 1, 380, 285],
        [380, 285, 2, 760, 570],
        [240, 180, 3, 480, 360], // DPR clamped to 2: no absurd buffer
    ])('maps %ix%i CSS at dpr %i to a %ix%i backing store', (w, h, dpr, expectW, expectH) => {
        expect(plinkoBackingSize(w, h, dpr)).toMatchObject({ width: expectW, height: expectH })
    })

    it('follows a container resize and a DPR change without moving model space', () => {
        vi.stubGlobal('window', { devicePixelRatio: 1 })
        const box = { width: 760, height: 570 }
        const { canvas, context } = fakeCanvas(box.width, box.height)
        canvas.getBoundingClientRect = () => ({ width: box.width, height: box.height })
        const engine = new PlinkoEngine(canvas, { rowCount: 12 })
        engine.stop()
        const pinsBefore = JSON.stringify(engine.pins)

        expect([canvas.width, canvas.height]).toEqual([760, 570])

        // Phone rotation: CSS shrinks the canvas, observer fires.
        box.width = 340
        box.height = 255
        expect(engine.handleResize()).toBe(true)
        expect([canvas.width, canvas.height]).toEqual([340, 255])
        expect(context.setTransform).toHaveBeenLastCalledWith(340 / 760, 0, 0, 255 / 570, 0, 0)

        // Drag to a 2× display.
        window.devicePixelRatio = 2
        engine.handleResize()
        expect([canvas.width, canvas.height]).toEqual([680, 510])

        // A no-op resize must not clear the buffer (which would blink the board).
        expect(engine.handleResize()).toBe(false)

        // Peg/bucket geometry is model space and never rescaled.
        expect(JSON.stringify(engine.pins)).toBe(pinsBefore)
        vi.unstubAllGlobals()
    })

    it('guards zero-sized and non-finite boxes', () => {
        expect(plinkoBackingSize(0, 0, 2)).toMatchObject({ width: 0, height: 0 })
        expect(plinkoBackingSize(NaN, 285, 2)).toMatchObject({ width: 0, height: 0 })
        expect(clampDpr(undefined)).toBe(1)
        expect(clampDpr(0)).toBe(1)
        expect(clampDpr(1.5)).toBe(1.5)
    })

    it('fits the frame inside the viewport at desktop, phone and phone-landscape sizes', () => {
        // Mirrors `.plinko-canvas-wrap`'s container-query calc: the frame must
        // never be wider than its viewport, and the canvas box it leaves must
        // stay inside the frame's content box.
        const css = readFileSync(fileURLToPath(new URL('./plinko.css', import.meta.url)), 'utf8')
        const rules = [...css.matchAll(/width: min\(100cqw, calc\(\(100cqh - (\d+)px\) \* 4 \/ 3 \+ (\d+)px\)\)/g)]
        expect(rules).toHaveLength(3)
        const [desktop, phone, landscape] = rules.map(([, reserve, inset]) => ({ reserve: Number(reserve), inset: Number(inset) }))
        // Desktop reserves the bin row + padding + gap; phone reserves the same
        // minus the tight 8px padding; landscape drops to 3px padding.
        expect(desktop).toEqual({ reserve: FRAME.reserved, inset: 34 })
        expect(phone).toEqual({ reserve: 6 + 20 + 8 + 8, inset: 14 })
        expect(landscape).toEqual({ reserve: 5 + 20 + 3 + 3, inset: 6 })

        for (const rule of [desktop, phone, landscape]) {
            for (const [cqw, cqh] of [[1200, 900], [390, 700], [740, 360], [320, 480], [1920, 420]]) {
                const width = Math.min(cqw, ((cqh - rule.reserve) * 4) / 3 + rule.inset)
                expect(width).toBeGreaterThan(0)
                expect(width).toBeLessThanOrEqual(cqw)
            }
        }
    })
})
