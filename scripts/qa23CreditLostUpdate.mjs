// D-1 demonstration: two documents, tab-local affordability, absolute writes.
// Pure model of CreditContext.placeBet semantics — no browser needed.
//
// `pre-fix` mirrors the code before the repair (affordability against the
// tab-local `balanceRef`); `post-fix` mirrors the repaired code (affordability
// against the stored value). Both models are SEQUENTIAL: they run one stake to
// completion before the next. They say nothing about two documents that read
// the same balance before either commits — that window is open, and is covered
// by the expected-fail test in src/context/CreditContext.test.js. The real repair is covered by the provider tests
// in src/context/CreditContext.test.js — this script only documents the shape
// of the defect and the arithmetic that closes it.
const KEY = 'gampo_credits'
const round = v => Math.max(0, Number(v.toFixed(2)))

function run(readStored) {
    const store = { [KEY]: '1000' }
    const read = () => Number(store[KEY])
    const write = v => { store[KEY] = String(v) }
    const tabA = { ref: read() }
    const tabB = { ref: read() }
    function placeBet(tab, amt) {
        const available = readStored ? read() : tab.ref
        if (amt > available) return false
        tab.ref = round(available - amt)
        write(tab.ref)
        return true
    }
    const a = placeBet(tabA, 600)
    const b = placeBet(tabB, 600)
    return { a, b, staked: (a ? 600 : 0) + (b ? 600 : 0), stored: read(), funded: 1000, lostUpdate: a && b && read() === 400 }
}

const before = run(false)
const after = run(true)

console.log(JSON.stringify({ before, after }, null, 1))

if (!before.lostUpdate) throw new Error('pre-fix model no longer reproduces D-1')
if (after.lostUpdate) throw new Error('post-fix model still loses an update')
if (after.staked !== 600 || after.stored !== 400) throw new Error(`post-fix accounting wrong: staked=${after.staked} stored=${after.stored}`)
console.log('D-1 sequential stale-ref: reproduced pre-fix, mitigated post-fix')
console.log('D-1 concurrent window: STILL OPEN — see the expected-fail test in')
console.log('  src/context/CreditContext.test.js (D-1 concurrent acceptance)')
