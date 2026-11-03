// D-1 demonstration: two documents, tab-local affordability, absolute writes.
// Pure model of CreditContext.placeBet semantics — no browser needed.
const KEY = 'gampo_credits'
const store = { [KEY]: '1000' }
const read = () => Number(store[KEY])
const write = v => { store[KEY] = String(v) }
// Tab-local balanceRef, seeded at mount.
const tabA = { ref: read() }
const tabB = { ref: read() }
function placeBet(tab, amt) {
    if (amt > tab.ref) return false          // :138 — tab-local affordability
    tab.ref = Math.max(0, Number((tab.ref - amt).toFixed(2)))
    write(tab.ref)                           // :145 — absolute write
    return true
}
const a = placeBet(tabA, 600)
const b = placeBet(tabB, 600)
console.log(JSON.stringify({ a, b, staked: 1200, stored: read(), funded: 1000, lostUpdate: a && b && read() === 400 }, null, 1))
