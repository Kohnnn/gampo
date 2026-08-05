// Live-path bridge between strategy source governance and the decision contract.
//
// The coach may only surface an exact claim when a validated strategy packet is
// configured. No such packet ships today: every local asset classifies as
// unreviewed approximate-local material (see sourceGovernance.classifyLocalAsset),
// so getConfiguredStrategyPacket returns null and the coach stays unavailable.
//
// This module exists so that unblocking exact coverage is a data change — supply a
// packet that survives validateManifest — rather than a code change to the live
// component. It cannot manufacture a source: every path either returns a source
// derived from a passing manifest verdict, or null.
//
// Enforcement note: validation lives in toDecisionSource, which rejects any
// non-passing verdict and any non-object context/result. Duplicating those checks
// here produced guards that could never fire (verified by mutation testing: the
// mutants were equivalent), so this module keeps only what is load-bearing —
// the empty configuration and containment of a hostile packet.

import { validateManifest, toDecisionSource } from './sourceGovernance'

/**
 * The strategy packet wired into the live coach, or null when none is configured.
 *
 * A packet must be an object of the shape:
 *   { manifest, resultFor(context) -> result | null }
 * where `manifest` passes validateManifest and `resultFor` returns a priced result
 * for the exact normalized context it is given, or null when it does not cover it.
 *
 * Returns null today by design. Phase 04 §C is blocked pending a reviewed authored
 * packet with a named reviewer, semver version, and declared coverage scope.
 */
export function getConfiguredStrategyPacket() {
    return null
}

/**
 * Build the source object for resolveDecision from a configured packet.
 * Returns null for any packet that is absent, malformed, rejected by manifest
 * validation, or that does not cover the supplied context.
 */
export function buildDecisionSource({ packet, context }) {
    try {
        if (!packet) return null
        const verdict = validateManifest(packet.manifest)
        const result = packet.resultFor(context)
        return toDecisionSource({ verdict, context, result })
    } catch {
        // A hostile or throwing packet must never take the coach down or leak a claim.
        return null
    }
}

/**
 * Convenience for the live path: resolve the currently configured source, if any.
 */
export function currentDecisionSource(context) {
    return buildDecisionSource({ packet: getConfiguredStrategyPacket(), context })
}
