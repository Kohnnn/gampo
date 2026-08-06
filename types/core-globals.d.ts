// Phase 05 — ambient globals for the thin `typecheck:core` lane.
//
// tsconfig.core.json deliberately omits the "dom" lib so that a module which
// truly depends on the DOM fails loudly instead of quietly qualifying as
// "pure". But `crypto.randomUUID` is not DOM-only: it is a standard global in
// browsers AND in Node 18+ (this repo runs Node 24). Declaring just that one
// member is narrower and more honest than pulling in the entire DOM surface.
//
// Keep this file minimal. Every addition widens what counts as pure.

declare const crypto: {
    randomUUID(): string
    getRandomValues<T extends ArrayBufferView>(array: T): T
}
