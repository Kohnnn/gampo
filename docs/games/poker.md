# Live Poker

GamPo's `/poker` route is a 6-max No-Limit Texas Hold'em cash table simulator with 5 bots, animated chips, animated cards, and a simulated chat sidebar. Practice credits only.

## Engine

`src/poker/engine/Game.js` is a pure JavaScript reimplementation of the standard NLH state machine, inspired by rlcard's Game / Round / Player / Judger split. Key entry points:

- `createInitialState({ players, sb, bb, buttonIndex })` builds the initial table state.
- `startHand(state)` advances the button, posts blinds, deals 2 hole cards each, and sets `toAct`.
- `legalActions(state)` returns the legal moves for the player on action: any subset of `[fold, check, call, raise]` (raise carries `min`/`max`).
- `applyAction(state, action)` transitions the state. It auto-advances streets, handles all-ins, and concludes the hand when only one player remains live or when the river finishes.
- `dealNext(state)` rotates the button and deals the next hand.

Hand evaluation is delegated to `pokersolver` (~25 KB) for correctness on 5/7-card hands.

All deck shuffles use `nextRoll('poker-shuffle')` from `fairRng.js`, so every hand is provably-fair-derived from the user's seed/nonce.

## Bots

`src/poker/bots/HeuristicBot.js` is a pluggable agent. Interface: `(state, seatIndex, aggression) => action`.

- **Pre-flop**: a hand-strength heuristic on a 0-1 scale based on rank, suited-ness, and gap.
- **Post-flop**: 120-rollout Monte Carlo equity estimate against random opponent ranges, using `pokersolver` to rank each rollout.
- **Decision tree**:
  - If checking is free, raise when equity > 0.65 (with jitter).
  - If facing a bet, fold below pot odds; raise above ~0.70 equity; otherwise call.
- Aggression level (0-1) tilts the raise threshold per seat so each bot feels different.

Roadmap: tighter pre-flop ranges, basic CFR-style preflop chart, exploitative tendencies, plus look-ahead 1-ply. See `docs/roadmap.md`.

## UI

`src/components/PokerGame/PokerGame.jsx` mounts a 6-seat oval felt with the user always at seat 0. The dealer button cycles each hand. The seat avatars are generated via `npm run gen:assets` (`poker-avatar-1..5`).

Action wheel:
- **Fold / Check / Call / Raise**.
- Raise has a slider plus presets: ½ pot, ¾ pot, Pot, Max.
- The action wheel respects `legalActions(state)` exactly.

Showdown reveals all live players' hole cards and shows the winning hand description from pokersolver.

## Chat sidebar

`PokerGame.jsx` ships a small simulated chat. Bots auto-speak short canned lines after some actions. The user's own chat is local only — never networked.

Banner reminds users: "Simulated chat. Bots and you only.".

## Buy-in / cash-out

Buy-in: 200 GC, taken from `placeBet`. Cashing out (or busting the table by busting all bots) returns the user's remaining stack to the credit ledger via `addWinnings`.

If the user busts, the toast reads "Busted" and the table closes.

## Audio

The poker UI plays `deal`, `flip`, `tick`, `click`, `win`, `loss` cues from the 16-bit synth bank in `src/audio/AudioProvider.jsx`. All cues respect the global mute toggle.

## Compliance

- No real-money flow. Practice credits only.
- Bots are stylized, generated portraits with no real-person likenesses.
- Chat is local-only. Nothing is transmitted.
