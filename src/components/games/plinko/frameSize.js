// QA008: the Plinko canvas draws in fixed 760×570 model space, so the frame
// that shares its box must reserve exactly the canvas plus bin row, padding and
// border. Keep that arithmetic in one place; plinko.css repeats the numbers
// (its `calc()` cannot import JS).
//
// ponytail: CSS still owns the responsive `calc()`; this mirrors it so tests can
// prove the canvas never shrinks under its own backing store. Fold into CSS if
// a container query unit ever lands for fixed-ratio boards.

export const FRAME = {
    width: 760,
    height: 570,
    // The `68px` in `.plinko-canvas-wrap` = board gap (8) + bin height (28) +
    // both paddings (18 + 14); the container-height branch of the CSS `calc()`
    // subtracts it.
    reserved: 8 + 28 + 18 + 14,
}

// `.plinko-canvas-wrap` padding sits outside the canvas on every side.
export const FRAME_INSET_X = 16
export const FRAME_INSET_Y = 18 + 14

export function clampDpr(dpr, max = 2) {
    const value = Number(dpr)
    if (!Number.isFinite(value) || value <= 0) return 1
    return Math.min(value, max)
}

// Backing-store size for a CSS box of `cssWidth` × `cssHeight`.
export function plinkoBackingSize(cssWidth, cssHeight, dpr) {
    const w = Number(cssWidth)
    const h = Number(cssHeight)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0, dpr: clampDpr(dpr) }
    const ratio = clampDpr(dpr)
    return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)), dpr: ratio }
}

// Geometry the frame asks for: the canvas keeps its 760×570 box and the frame
// adds its own chrome. Used by the CSS-parity test.
export function frameWidthForBoard(boardWidth = FRAME.width) {
    return boardWidth + FRAME_INSET_X * 2
}

export function frameHeightForBoard(boardWidth = FRAME.width) {
    return (boardWidth * FRAME.height) / FRAME.width + FRAME_INSET_Y + FRAME.reserved
}
