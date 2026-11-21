// QA024 (#33): a collection game must label its raw money-symbol values
// separately from the GC actually credited.
//
// Historical hosted observation: Bass Bayou / Gummy intermediate values were not
// clearly separated from the converted, credited payout. The raw money total is a
// sum of pre-scalar bet multipliers; it is *not* GC and it is not what the wallet
// receives. The result banner owns paid GC.
//
// This pins the distinction at the production boundary: the outcome's raw total,
// the credited return, and the banner's own figure must stay three different
// things, and the intermediate surface must say so.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./SlotsGame.jsx', import.meta.url), 'utf8')

// The raw-collection block and the paid-return banner are separate surfaces.
// Ends at this block's own closing, so the banner that follows is not included.
const rawStart = src.indexOf('{moneyTotal > 0 && !running')
const rawCollectionBlock = src.slice(rawStart, src.indexOf('</div>', src.indexOf('rounding determine the total paid return')) + 6)

describe('QA024 collection values are distinguished from credited GC', () => {
    it('labels the raw collection as bet multipliers, not GC', () => {
        expect(rawCollectionBlock).toContain('Raw collection')
        // The label must state the basis and that it is not currency.
        expect(rawCollectionBlock).toMatch(/raw bet multipliers, not GC/)
        expect(rawCollectionBlock).toMatch(/Added to raw line wins/)
        // And that scaling/caps/rounding decide what is actually paid.
        expect(rawCollectionBlock).toMatch(/rounding determine the total paid return/)
    })

    it('keeps the paid-return banner the only surface that claims GC', () => {
        // The banner is the surface that labels and shows the paid figure.
        const paidAt = src.indexOf('Total paid return')
        expect(paidAt).toBeGreaterThan(-1)
        const banner = src.slice(src.lastIndexOf('slot-result-banner', paidAt), paidAt)
        expect(banner).toContain('slot-result-banner')
        // Its own figure comes from the settled return, not the raw collection.
        expect(src.slice(paidAt, paidAt + 400)).toContain('formatCredits(shownWin)')
        // The raw collection block must not present itself as a paid amount.
        expect(rawCollectionBlock).not.toMatch(/Total paid return/)
        // And the banner's figure is `lastResult.returnAmount`, not moneyTotal.
        expect(src).toContain('const shownWin = rollupActive ? winRollup.amount : lastResult.returnAmount')
    })

    it('only shows the raw-collection surface for the collection templates', () => {
        // A non-collection template has no raw money total, so the surface must be
        // gated rather than shown with a zero or inherited value.
        expect(rawCollectionBlock).toContain("config.id === 'bass-bayou'")
        expect(rawCollectionBlock).toContain("config.skin === 'bayou'")
        expect(rawCollectionBlock).toContain('moneyTotal > 0')
    })

    it('reads the raw total from the settled result, not from live bet state', () => {
        // A quote derived from the current stake would relabel a past round.
        expect(src).toContain('const moneyTotal = lastResult?.moneyTotal || 0')
        expect(src).toContain('lastResult?.moneyValues?.length')
    })
})