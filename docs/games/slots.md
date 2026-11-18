# Slots

`/slots` opens the slot factory; direct template routes select the same engine with their own grid, symbols, features, and configured return target. Templates include line-pay, ways, cluster, cascade, and variable-row Megaways layouts.

## Return disclosures

- The header, game information, paytable/rules, session target, and education use the selected template's configured nominal RTP and the applied Fun setting.
- Feature-contract Math notes describe volatility only; nominal RTP comes from the canonical disclosure for the applied mode.
- Nominal RTP is a model target, not a guarantee or a fresh measurement. Observed session RTP remains separate.
- A base-spin return target does not establish a bonus purchase's expected return. Bonus-buy quotes identify that limitation.
- Payout scalars remain generated calibration data; presentation changes do not recalibrate outcomes.

## Symbols and winning paths

- Winning outlines use actual rendered cell bounds in the overlay's coordinate system, including borders, gaps, responsive sizing, and variable reel heights.
- Bars and Coop Cluck use visible identity labels where different symbols share artwork. Grid and paytable identities remain consistent.
- Tall transparent rank artwork uses measured crop bounds in the shared renderer; grid, paytable, fullscreen, and missing-image labels retain the same symbol identities and assets.
- Wanted's mystery reveal is temporary; the settled board becomes uncovered. A new spin clears the previous reveal.
- Bass Bayou fish values and collection totals are raw multiplier units before payout scaling, not separately credited GC. The result banner reports the actual total paid.

## Playfield and fullscreen

- The reel board, Bet/Win values, and primary controls use a viewport-bounded stage; supporting panels, history, and education remain in secondary scrollable space.
- Persistent free-spin, cascade, and coin-meter notices stay in secondary content instead of covering settled symbols; transient award/reveal presentation remains separate.
- The labeled fullscreen control uses native browser fullscreen on the existing mounted stage, retaining its board and result. In-stage controls remain available; Escape exits and focus returns to the opener.

## Motion and controls

- Normal, reduced-motion, and animation-off preferences preserve a readable final result. Slot speed is a separate setting.
- A visible Skip / Skip animation control slam-stops the existing accepted round; it does not place another wager.
- Reduced-motion and animation-off completion is verified statically without requiring an intermediate paint; normal-motion verification requires native active pixels.
- Animation-count measurements prompted removal of per-cell idle shine/bob loops. Static cell backgrounds, borders, and shadows retain symbol framing; stage atmosphere and gameplay, win, and bonus motion remain.
- Autoplay configuration uses a native modal dialog: Escape closes it, background interaction is blocked, and focus returns to the opener.
- A selected autoplay count is spent by accepted, completed rounds only — free rounds included. An attempt rejected by the spin lock or a refused debit settles no round, appears in no history row, and spends nothing; a refused debit ends the session.
- Manual Freeze-column controls affect reel animation only. The resolved outcome is drawn fresh each spin, so a frozen column never carries symbols forward.
- Existing spin eligibility, free-spin caps, bonus rules, and autoplay stop policy remain unchanged.

## Local deterministic checks

The existing `window.__gampoSlotQa` seam is DEV-only. It accepts validated queued resolver outcomes and bounded free-spin session fixtures for local accounting and visual checks. Fixture evidence is not natural-outcome coverage. Built output must pass `npm run guard:qa-seam` and its self-test; production must not expose the seam.
