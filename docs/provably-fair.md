# Provably Fair

GamPo ships a working seed/nonce flow at `/verify`, backed by `src/utils/fairRng.js`.

## Model

For each play in a wired game:

1. The lab maintains one `serverSeed` per session, kept in `localStorage`.
2. The user holds a `clientSeed` editable from the verify page.
3. A `nonce` increments on every wired roll.
4. The roll is derived from `HMAC-SHA-256(serverSeed, clientSeed:nonce:gameId)` via Web Crypto. The first 8 hex chars of the digest map to a number in `[0, 1)`.

This mirrors the seed/client/nonce flow of mainstream crypto-casino implementations. Every value stays on-device and is reset by clearing `localStorage`.

For test environments without Web Crypto, a deterministic fallback (`hashTo32`) is used, so the math tests stay green.

## Wired games

`nextRoll(gameId)` (or `nextRollAsync` for true HMAC) is currently used by:

- Dice, Limbo, Wheel, Roulette
- Coin Flip, RPS, Guess Number, Hi-Lo, Color Pick
- Sic Bo, Tower, Chicken Cross
- Slots (per-cell weighted symbol pick)
- Lottery, Keno (per-ball draws)
- Mines (auto-pick fallback)
- Card games (Blackjack, Baccarat, Casino War, Video Poker, Hi-Lo) via the seeded `shuffleDeck` and `buildShoe`

## Verify page

`/verify` shows:

- Active server seed (hashed, masked).
- Previous server seed (revealed once you rotate).
- Current nonce.
- Editable client seed with an Apply action.
- Rotate seeds and Clear log actions.
- Live grid of recent rolls with `gameId`, `nonce`, the composite key, the produced `roll`, and (when Web Crypto is available) the **HMAC-SHA-256 digest**.
- Recent settled bet/win transactions for cross-checking.

## API

```js
import { nextRoll, nextRollAsync, rotateSeeds, setClientSeed, getRecentRolls, clearRecentRolls, getProvablyFair, maskSeed } from './utils/fairRng'

const { roll, nonce, clientSeed } = nextRoll('dice')
const { roll, nonce, hmac } = await nextRollAsync('dice')
```

## Storage keys

- `gampo_pf_state`: `{ serverSeed, previousServerSeed, clientSeed, nonce }`.
- `gampo_pf_recent`: array of recent roll log entries (max 60), with `hmac` field populated asynchronously.

Clearing browser storage resets everything to fresh randomness.
