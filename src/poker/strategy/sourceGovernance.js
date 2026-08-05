// Phase 04 — authored cash source governance.
//
// Validates a candidate strategy packet BEFORE it may reach resolveDecision, and
// classifies existing local data honestly. Nothing here can promote data to
// `supported`; it can only refuse. Promotion still requires resolveDecision to see
// kind 'authored-local' + reviewed === true + a full context match.
//
// Deliberate: this module never mutates, never fetches, and never invents ranges.

export const SOURCE_KINDS = Object.freeze(['authored-local', 'approximate-local', 'legacy-local'])

export const MANIFEST_REASONS = Object.freeze({
    MANIFEST_MISSING: 'MANIFEST_MISSING',
    MANIFEST_MALFORMED: 'MANIFEST_MALFORMED',
    SOURCE_ID_MISSING: 'SOURCE_ID_MISSING',
    VERSION_MISSING: 'VERSION_MISSING',
    VERSION_MALFORMED: 'VERSION_MALFORMED',
    KIND_UNKNOWN: 'KIND_UNKNOWN',
    REVIEW_UNDECLARED: 'REVIEW_UNDECLARED',
    REVIEWER_MISSING: 'REVIEWER_MISSING',
    COVERAGE_UNDECLARED: 'COVERAGE_UNDECLARED',
    COVERAGE_MALFORMED: 'COVERAGE_MALFORMED',
    GENERIC_FALLBACK_DECLARED: 'GENERIC_FALLBACK_DECLARED',
})

// A packet claiming review must name who reviewed it. Anonymous review is not review.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

function readOnce(target, key) {
    try {
        return { ok: true, value: target[key] }
    } catch {
        return { ok: false, value: null }
    }
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function reject(reason, detail) {
    return Object.freeze({ ok: false, reason, detail, manifest: null })
}

/**
 * Validate a packet manifest. Returns a frozen verdict; never throws.
 * A valid verdict does NOT mean the data is good strategy — only that the packet
 * declares its own identity, version, review status, and coverage honestly.
 */
export function validateManifest(input) {
    try {
        if (input === null || input === undefined) return reject(MANIFEST_REASONS.MANIFEST_MISSING, 'No manifest was supplied.')
        if (!plain(input)) return reject(MANIFEST_REASONS.MANIFEST_MALFORMED, 'Manifest is not a plain data object.')

        const sourceId = readOnce(input, 'sourceId')
        const version = readOnce(input, 'version')
        const kind = readOnce(input, 'kind')
        const reviewed = readOnce(input, 'reviewed')
        const reviewer = readOnce(input, 'reviewer')
        const coverage = readOnce(input, 'coverage')
        const genericFallback = readOnce(input, 'genericFallback')
        if (![sourceId, version, kind, reviewed, reviewer, coverage, genericFallback].every(r => r.ok)) {
            return reject(MANIFEST_REASONS.MANIFEST_MALFORMED, 'Manifest fields could not be read.')
        }

        if (!nonEmptyString(sourceId.value)) return reject(MANIFEST_REASONS.SOURCE_ID_MISSING, 'Manifest has no sourceId.')
        if (!SOURCE_KINDS.includes(kind.value)) return reject(MANIFEST_REASONS.KIND_UNKNOWN, 'Manifest kind is not a recognized source kind.')
        if (version.value === undefined || version.value === null || version.value === '') return reject(MANIFEST_REASONS.VERSION_MISSING, 'Manifest has no version.')
        if (!nonEmptyString(version.value) || !SEMVER.test(version.value.trim())) return reject(MANIFEST_REASONS.VERSION_MALFORMED, 'Manifest version is not semver.')
        if (typeof reviewed.value !== 'boolean') return reject(MANIFEST_REASONS.REVIEW_UNDECLARED, 'Manifest does not declare a boolean reviewed flag.')

        // Claiming review requires an accountable named reviewer.
        if (reviewed.value === true && !nonEmptyString(reviewer.value)) {
            return reject(MANIFEST_REASONS.REVIEWER_MISSING, 'Manifest claims review but names no reviewer.')
        }

        // A packet must state what it covers, so uncovered spots stay unavailable.
        if (coverage.value === undefined || coverage.value === null) return reject(MANIFEST_REASONS.COVERAGE_UNDECLARED, 'Manifest declares no coverage scope.')
        if (!Array.isArray(coverage.value) || coverage.value.length === 0) return reject(MANIFEST_REASONS.COVERAGE_MALFORMED, 'Manifest coverage is not a non-empty list.')
        if (!coverage.value.every(nonEmptyString)) return reject(MANIFEST_REASONS.COVERAGE_MALFORMED, 'Manifest coverage contains non-string entries.')

        // A generic catch-all chart can never back an exact claim.
        if (genericFallback.value === true && reviewed.value === true) {
            return reject(MANIFEST_REASONS.GENERIC_FALLBACK_DECLARED, 'A packet with a generic fallback chart cannot be treated as reviewed exact coverage.')
        }

        return Object.freeze({
            ok: true,
            reason: null,
            detail: null,
            manifest: Object.freeze({
                sourceId: sourceId.value.trim(),
                version: version.value.trim(),
                kind: kind.value,
                reviewed: reviewed.value,
                reviewer: nonEmptyString(reviewer.value) ? reviewer.value.trim() : null,
                coverage: Object.freeze([...coverage.value]),
                genericFallback: genericFallback.value === true,
            }),
        })
    } catch {
        return reject(MANIFEST_REASONS.MANIFEST_MALFORMED, 'Manifest validation failed.')
    }
}

/**
 * Classify an existing local data asset. This is the honest read of what ships today:
 * no named reviewer, no semver, solver-derived prose, and a generic fallback chart.
 * Always returns a non-authored kind — this function cannot produce 'authored-local'.
 */
export function classifyLocalAsset(asset, assetName) {
    const base = { assetName: typeof assetName === 'string' ? assetName : null, kind: 'legacy-local', reviewed: false, reasons: [] }

    if (!plain(asset)) {
        return Object.freeze({ ...base, sourceId: base.assetName, version: null, genericFallback: false, reasons: Object.freeze(['UNREADABLE_ASSET']) })
    }

    const reasons = []
    const schemaVersion = readOnce(asset, 'schemaVersion').value
    const format = readOnce(asset, 'format').value
    const notes = readOnce(asset, 'notes').value
    const matchup = readOnce(asset, 'matchup').value

    if (!nonEmptyString(readOnce(asset, 'reviewer').value)) reasons.push('NO_NAMED_REVIEWER')
    if (typeof schemaVersion !== 'string' || !SEMVER.test(String(schemaVersion))) reasons.push('NO_SEMVER_VERSION')
    if (typeof notes === 'string' && /solver|gto/i.test(notes)) reasons.push('SOLVER_DERIVED_PROSE')
    const genericFallback = plain(matchup) && Object.prototype.hasOwnProperty.call(matchup, 'default')
    if (genericFallback) reasons.push('GENERIC_FALLBACK_CHART')
    if (plain(readOnce(asset, 'exploits').value)) reasons.push('UNREVIEWED_EXPLOIT_BLOCK')

    return Object.freeze({
        assetName: base.assetName,
        sourceId: nonEmptyString(format) ? format : base.assetName,
        version: schemaVersion === undefined || schemaVersion === null ? null : `schema-${schemaVersion}`,
        kind: 'approximate-local',
        reviewed: false,
        genericFallback,
        reasons: Object.freeze(reasons),
    })
}

/**
 * Build the source object handed to resolveDecision, from a validated manifest.
 * Refuses anything that did not pass validateManifest. Cannot fabricate a result.
 */
export function toDecisionSource({ verdict, context, result }) {
    if (!verdict || verdict.ok !== true || !verdict.manifest) return null
    const m = verdict.manifest
    if (!plain(context) || !plain(result)) return null
    return {
        sourceId: m.sourceId,
        kind: m.kind,
        reviewed: m.reviewed,
        version: m.version,
        context,
        result,
    }
}
