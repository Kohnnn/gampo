// Patch 5 audit: find CSS rule blocks that risk clipping scrollable content.
// The desktop scroll contract is: .game-shell clamps to viewport (hidden),
// .gs-layout is a non-scrolling grid (hidden), and .gs-playfield is the one
// scroll surface (overflow-y: auto). Anything that breaks that chain clips.
// Flags:
//  A) any rule whose final subject is .gs-playfield that sets overflow or
//     overflow-y to hidden (kills the designated scroll surface)
//  B) rules whose final subject is a stage-level wrapper combining
//     overflow:hidden with a fixed px/vh height cap - content taller than the
//     cap would be unreachable even though the playfield scrolls, because the
//     clip happens inside the scroll surface. Shell-level `height: 100%`
//     clamps (.game-shell) are the intended contract and are not flagged;
//     percentage heights inherit from the scrollable chain.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src')
const files = []
const walk = (dir) => {
    for (const e of readdirSync(dir)) {
        const p = join(dir, e)
        if (statSync(p).isDirectory()) walk(p)
        else if (e.endsWith('.css')) files.push(p)
    }
}
walk(root)

const findings = []
for (const file of files) {
    const css = readFileSync(file, 'utf8')
    // crude rule splitter: selector { body }
    const re = /([^{}]+)\{([^{}]*)\}/g
    let m
    while ((m = re.exec(css))) {
        const sel = m[1].trim().split('\n').pop().trim()
        const body = m[2]
        const line = css.slice(0, m.index).split('\n').length
        const hidden = /overflow(?:-y)?\s*:\s*hidden/.test(body)
        if (!hidden) continue
        if (/\.gs-playfield/.test(sel)) {
            findings.push({ file, line, sel, kind: 'A: .gs-playfield overflow hidden' })
        }
        const heightCap = /(?:^|;)\s*(?:max-)?height\s*:\s*\d+(?:px|vh|vw)/.test(body)
        if (heightCap && /(stage|gs-)/.test(sel)) {
            findings.push({ file, line, sel, kind: 'B: hidden + height cap on stage wrapper' })
        }
    }
}

if (findings.length === 0) {
    console.log('OK: no playfield clipping risks found.')
} else {
    for (const f of findings) console.log(`${f.kind}\n  ${f.file}:${f.line}\n  ${f.sel}`)
    process.exitCode = 1
}
