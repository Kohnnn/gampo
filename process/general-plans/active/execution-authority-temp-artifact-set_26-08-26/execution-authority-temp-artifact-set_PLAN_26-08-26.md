---
name: plan:execution-authority-temp-artifact-set
summary: "Backward-compatible temporary-artifact execution authority for exact Windows temp targets"
description: "Extend the canonical execution-authority envelope with an isolated temporary-artifact-set/v1 branch while preserving the legacy six-field Report/Correction branch."
date: 26-08-26
status: VALIDATE REQUIRED
complexity: COMPLEX
metadata:
  node_type: memory
  type: plan
  feature: harness
  risk: high-trust-boundary
---

# Execution Authority Temporary Artifact Set

**Date**: 26-08-26
**Status**: VALIDATE REQUIRED — AC-05 and AD-03A are amended for original-handle identity/readback; standalone probe evidence remains rejected pending controlled-substitution exercise, fresh VALIDATE, repair EXECUTE, and independent EVL
**Complexity**: COMPLEX — one cross-cutting harness execution stream
**Selected plan:** `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`
**Report destination:** `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md`
**Autopilot authority proof:** `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_AUTOPILOT_GOAL_26-08-26.md`

## TL;DR

Add an isolated `authorityClass: "temporary-artifact-set/v1"` dispatch to the existing Node validator and mirrored VALIDATE/EXECUTE contracts. Preserve byte-for-byte observable legacy validation behavior when `authorityClass` is absent; authorize only 1–8 exact absolute Windows files strictly beneath `C:\Users\Admin\AppData\Local\Temp\opencode`; require exclusive creation, non-reparse checks, readback receipts, and high-risk evidence before completion.

## Quick Links

- [Context and Goals](#context-and-goals)
- [Public Contracts](#public-contracts)
- [A4.6 Reference Envelope](#a46-reference-envelope-and-acceptance-criterion)
- [Implementation Checklist](#implementation-checklist)
- [Touchpoints](#touchpoints)
- [Verification Evidence](#verification-evidence)
- [Resume and Execution Handoff](#resume-and-execution-handoff)
- [Validate Contract](#validate-contract)

## Context and Goals

The canonical `execution-authority-envelope/v1` currently accepts exactly six top-level fields and binds one repository-relative Report or Correction destination. A4.6 needs four create-only absolute OS-temporary artifacts and truthfully cannot use that legacy branch. This plan adds one discriminator-based branch to the same envelope fence and validator without widening repository execution authority.

### Goals

- **AC-01 — legacy compatibility:** With `authorityClass` absent, retain the existing six-field Report/Correction branch, validation order, rejection behavior, error text, exit status, and PASS JSON shape.
- **AC-02 — isolated dispatch:** Dispatch to temporary-artifact validation only when `authorityClass === "temporary-artifact-set/v1"`; reject unknown values and mixed legacy/temporary fields.
- **AC-03 — exact schema:** Require exactly the temporary branch fields and exact nested record keys defined under Public Contracts.
- **AC-04 — bounded target authority:** Authorize 1–8 unique exact absolute Windows file targets strictly beneath `C:\Users\Admin\AppData\Local\Temp\opencode`; no root equality, traversal, globs, prefix collisions, UNC/device namespaces, trailing dot/space components, alternate data streams, or aliases.
- **AC-05 — original-handle-bound trustworthy creation and fail-closed cleanup:** EXECUTE performs exactly one initial full-envelope preflight for the temporary lane and freezes approved-root identity as precreate `rootReal`. For each target, `createTemporaryArtifact` opens exactly once with `fs.openSync(path, "wx+")`, keeps that original descriptor open, writes every byte through that descriptor, calls `fs.fsyncSync`, freezes `handleIdentity` from `fs.fstatSync(handle, { bigint: true })`, reruns the full approved-root lexical-chain, ancestry/reparse, containment, destination regular-file, destination realpath, and path-`lstatSync(..., { bigint: true })` checks, and compares exact path identity to the frozen handle identity. It then reads exactly the frozen byte length through the original descriptor with positional `fs.readSync` calls starting at offset `0`, performs a one-byte EOF probe at the exact expected length, and verifies bytes, schema marker, byte count, and SHA-256. Only after all checks pass may it close the descriptor; only a successful close may permit public receipt emission. Any write/flush/stat/path-check/identity/read/EOF/hash/schema/close failure emits no receipt. Before any root `realpath`, lexically derive and `lstat` the approved-root chain and reject a Node-observable root symlink, junction, or reparse alias. Failed creation cleanup runs only after close and may unlink only when the current path identity/type still equals the frozen created-object identity. Missing or substituted paths are retained with `manual-cleanup-required`; no recursive deletion or unsafe replacement deletion is allowed.
- **AC-06 — receipt evidence:** Every created target yields an in-memory/process-evidence receipt with schema `execution-temp-artifact-receipt/v1`; a receipt is evidence, not a fifth authorized artifact.
- **AC-07 — parser integrity:** Reject literal and escaped-equivalent duplicate JSON keys before `JSON.parse` can collapse them, but apply decoded escaped-equivalent duplicate-key hardening only after temporary-branch selection so absent-`authorityClass` legacy rejection behavior and order remain unchanged.
- **AC-08 — parity and documentation:** Claude/Codex VALIDATE and EXECUTE prompts, protocol docs, audit skill, fixtures, and test context describe the same two-branch contract. Every unconditional mid-phase and completion-envelope instruction in both EXECUTE mirrors is explicitly legacy Report/Correction only; the temporary lane remains exactly one initial full preflight plus per-target precreate/postreadback checks, with no mid-phase or completion full-envelope rerun.
- **AC-09 — high-risk proof:** VALIDATE and EXECUTE produce the required `vc-risk-evidence-pack` for permission/trust-boundary logic, preserve raw stdout/stderr/exit receipts for every mandatory gate, and obtain a fresh independent EVL `APPROVE`; until then plan, Report, verification, adversarial, index, independent-EVL, and risk statuses remain `VALIDATE REQUIRED`/`REPAIR REQUIRED`/`FAIL`/`REJECT`. Current Report/verification/adversarial claims that original-handle identity/readback and standalone controlled-substitution behavior are ruled out/PASS are false. `creation-probe.json` and `junction-probe.json` currently prove only happy-path cleanup and do not record standalone controlled-substitution refusal; they are stale evidence and must be replaced before any PASS claim. Evidence must retain `PRE_EDIT_BASELINE_UNAVAILABLE` and `REPAIR_BASELINE_BYTES_UNRECOVERABLE`; the failed historical `repair.patch` remains immutable and is never fabricated or counted in the success conjunction.
- **AC-10 — bounded regression:** Harness-focused checks, `typecheck:core`, and the full `npm test` suite pass without application-source edits or dependency changes.
- **AC-11 — Windows basename safety:** Reject Windows reserved DOS device basenames case-insensitively in every target component, including extension-bearing forms and applicable superscript-digit aliases (`COM¹`/`COM²`/`COM³`, `LPT¹`/`LPT²`/`LPT³`).

## Acceptance Criteria

Acceptance requires AC-01 through AC-11 above to be satisfied with the evidence mapped in `## Verification Evidence`; no criterion may be inferred from file existence alone.

## Scope

### In scope

- Backward-compatible validator dispatch and duplicate-key hardening.
- One new positive temporary-envelope fixture and the complete negative matrix listed below.
- Validator self-checks or injectable filesystem seams for canonical Windows path and reparse behavior.
- `vc-audit-vc` usage/contract documentation.
- Canonical VALIDATE and EXECUTE protocol documentation.
- Claude/Codex VALIDATE and EXECUTE prompt parity.
- Durable testing-context documentation.
- Colocated high-risk evidence pack created during VALIDATE/EXECUTE.

### Out of scope

- Any file under `src/`, `api/`, `server/`, `netlify/`, `public/`, or other application source.
- Editing `process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-controller-contract-authority-a4.6_PLAN_26-08-26.md`; it remains non-executable until this plan is implemented, independently validated, and A4.6 receives fresh V1–V7.
- Editing historical `process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-asset-provenance-delivery_PLAN_07-08-26.md`.
- Creating any A4.6 registry, provenance, cross-reference, validator, controller, harness, projector, candidate source, candidate test, Report, or Correction artifact.
- New dependencies, package/lockfile changes, build configuration, deployment configuration, Git commit, push, PR, deploy, or external-service mutation.

## Phase Completion Rules

This plan is not complete when files merely exist. Completion requires:

1. The isolated branch and all documented parity edits exist.
2. Legacy direct validation and the full mixed fixture suite pass with the legacy PASS payload unchanged.
3. Temporary positive and every required negative scenario behave fail-closed.
4. Reparse security has manual Windows evidence or deterministic injected-seam evidence plus an explicit portability ceiling.
5. `vc-risk-evidence-pack` contains all five reviewed artifacts and `review-decision.json` says `APPROVE`.
6. All verification gates in this plan pass except the known absent frontmatter validator, which must be reported accurately as not passed.
7. A fresh reviewer confirms no app source, A4.6 plan, historical Phase 02 plan, dependency, Git, or deployment scope entered the repair baseline/patch evidence.
8. Because true pre-edit content was not retained and exact repair-baseline before bytes are also unrecoverable, evidence records both `PRE_EDIT_BASELINE_UNAVAILABLE` and `REPAIR_BASELINE_BYTES_UNRECOVERABLE`. The existing empty `repair.patch` is frozen byte-for-byte as failed historical evidence, remains indexed, is excluded from the new success conjunction, and is never rewritten, reconstructed, or represented as PASS.
9. The replacement exact current-state review lane compares the complete baseline/after manifest entry sets, derives every differing/new/deleted path only from manifest SHA-256 values and membership, requires the exact allowlist with no unexpected path and no deletion, and requires a fresh independent reviewer to exhaustively inspect the complete current bytes of every differing or new path. The manifest/current-state set remains the same nine paths: validator, both EXECUTE mirrors, Report, and five risk artifacts. It explicitly retains the residual provenance gap that historical before bytes cannot be reconstructed.
10. Legacy compatibility is proven behaviorally from direct native stdout/stderr/exit capture over all original 10 fixtures and current canonical legacy source semantics; no PowerShell-transformed output is an oracle.
11. `index.json` may mark implementation/evidence integrity `PASS` only when `repairPatchStatus` is exactly `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`, the frozen failed patch remains indexed but excluded from the conjunction, the current-state review lane passes, all fresh gates pass or retain their explicitly accepted known-gap status, and independent EVL is `APPROVE`.

Status meanings: `PLANNED` means untouched; `REPAIR REQUIRED` means implementation exists but independent review rejected it and no completion claim is valid; `CODE DONE` means edited but not independently proven; `TESTING` means gates are running; `VERIFIED` requires the complete evidence above and fresh independent EVL PASS; `HALTED` means a declared stop condition fired.

## Architecture Decisions

### AD-01 — One fence, isolated discriminator dispatch

Keep the fence label `json execution-authority-envelope/v1`. Parse duplicate-safe JSON once, then dispatch:

- `authorityClass` absent: call the unchanged legacy six-field validator path.
- `authorityClass === "temporary-artifact-set/v1"`: call the new temporary validator path.
- Any other value: block.

The legacy function must not receive temporary schema rules, path normalization, count fields, receipt handling, or new PASS fields. Refactoring is permitted only where required to isolate dispatch without changing legacy observable behavior.

### AD-02 — Node standard library only

Use installed Node 24 standard-library APIs only: `node:fs`, `node:path`, `node:child_process`, and `node:crypto` where required. Add no dependency and no package script unless VALIDATE explicitly proves an existing exact command cannot express a required gate; such a finding returns to PLAN rather than broadening EXECUTE.

### AD-03 — Lexical validation plus filesystem identity checks

Temporary target validation has two layers:

1. Envelope validation proves strict Windows lexical shape and containment, including case-insensitive reserved DOS device basename rejection for plain, extension-bearing, and applicable superscript-digit alias forms.
2. EXECUTE proves current filesystem facts at exactly one initial full-envelope preflight and again per target immediately before exclusive create and while the original `wx+` descriptor remains open during postwrite/postreadback validation.

Before calling `realpath` on the approved root, lexically derive and `lstat` each existing approved-root chain component from the drive root through `opencode`; reject any Node-observable symbolic link, junction, or reparse alias, including the approved root itself. Only then resolve and freeze the approved-root identity. String-prefix containment is forbidden. Use canonical path component boundaries and case-insensitive Windows comparison. A target must be a child, never equal to the approved root.

### AD-03A — Original-handle identity and exact readback

Open the destination exactly once with `fs.openSync(path, "wx+")`; `wx+` is mandatory because verification reads through the same descriptor. Keep that descriptor open through all writes, `fs.fsyncSync`, handle-identity freeze, full path postreadback validation, exact positional readback, hash/schema checks, and receipt construction. Use a `try`/`finally` close discipline, but do not return or emit the receipt from inside the `try`: record verification success in memory, close exactly once in `finally`, treat any close error as operation failure, and emit the receipt only after `finally` completes without a close error.

Define the private exact identity tuple in this key order as `handleIdentity = { dev, ino, modeType }`. Obtain it from `fs.fstatSync(handle, { bigint: true })`; retain `dev` and `ino` as `bigint`; compute `modeType = mode & BigInt(fs.constants.S_IFMT)`; require `modeType === BigInt(fs.constants.S_IFREG)`. The tuple is usable only when `dev`, `ino`, and `modeType` are `bigint`, `modeType` is regular, and `(dev !== 0n || ino !== 0n)`. Any throw, unsupported bigint observation, non-regular type, or all-zero `dev`/`ino` pair is conservatively unusable and blocks receipt. After full postreadback root/ancestry/containment/destination checks, call `fs.lstatSync(path, { bigint: true })`, require regular and non-symbolic-link type, normalize it to the same ordered `{ dev, ino, modeType }`, apply the same usability rule, and compare `dev ===`, `ino ===`, and `modeType ===` exactly. Do not compare size, timestamps, path spelling, or realpath string as object identity. Do not serialize private identity values into the unchanged public receipt.

Windows ceiling: Node exposes `Stats` bigint fields but does not guarantee that `dev` plus `ino` is a universally stable object identifier on every Windows filesystem. This exact tuple is mandatory defense-in-depth and fail-closed when unavailable, not a universal object-identity proof. Add a narrow injectable identity-normalization/comparison seam, deterministic usable/mismatch/unusable self-checks, and a live same-host creation probe that records both original-handle and path snapshots as decimal strings plus comparison result without changing the public receipt. Universal Windows object identity requires a separately approved native handle-information helper.

Write exact bytes through the descriptor with a loop over `fs.writeSync(handle, bytes, written, remaining, written)` until `written === bytes.length`; a zero write before completion blocks. After `fs.fsyncSync` and the identity/path checks, allocate exactly `bytes.length` bytes and loop `fs.readSync(handle, buffer, filled, remaining, filled)` from positional offset `0` until full; a zero read before completion blocks as short read. Then perform one one-byte positional read at offset `bytes.length` and require `0` bytes, rejecting trailing data. Validate exact byte equality, byte count, schema marker, and SHA-256 before close. Never call `readFileSync`, reopen the path, or close before content verification.

Failure cleanup runs only after the original descriptor has closed. It may unlink the destination only after a fresh path `lstatSync(..., { bigint: true })` yields a usable tuple exactly matching frozen `handleIdentity`; otherwise retain the path and return `manual-cleanup-required`. This narrows known substitution risk but does not eliminate the final pathname race between identity check and `unlinkSync`.

### AD-04 — Evidence does not widen authority

Receipts stay in memory, command output, phase report evidence, or the plan's colocated risk evidence pack. They are not written beside temporary targets and do not become another `allowed_scope` entry.

### AD-05 — Injectable reparse seam plus bounded Windows probe and fail-closed cleanup

Use an injectable Node-standard-library filesystem observation seam for deterministic fixture/self-check coverage. The seam may expose only the read-only identity operations needed by production checks (`realpathSync.native`, `lstatSync`, `statSync`, and existence/ancestor observations); it must not intercept writes or expose a generic filesystem API.

Production logic remains mandatory and unmocked by default: lexically derive and `lstat` the existing approved-root chain before `fs.realpathSync.native`, reject a Node-observable root or ancestor symbolic link/junction/reparse alias, canonicalize and freeze the approved-root identity as precreate `rootReal`, walk every existing target ancestor component with `lstat`, require realpath containment at component boundaries, and while the original `wx+` descriptor remains open rerun the complete root identity + ancestry/reparse + containment + destination `lstat` regular-file + destination realpath sequence before a receipt can exist. The postreadback root observation must equal the frozen precreate `rootReal`; a second independent resolve without direct equality comparison does not satisfy this contract. On Windows, EXECUTE runs two standalone live probes under UUID-owned exact children of the approved root. `--creation-probe` is mandatory and may not SKIP. `--junction-probe` is also mandatory on Windows when junction creation succeeds; only inability to create a junction because of privilege/policy may be `SKIP`, and that SKIP is never PASS. Both probes must exercise a normal success path and a controlled substitution-refusal path in live filesystem state; deterministic self-checks do not substitute for these standalone observations.

Probe cleanup is security-sensitive and must never call `rmSync`, recursive removal, or tree traversal. After every owned object is created, capture its expected usable identity/type. Immediately before each cleanup primitive, `lstat` again and require exact identity/type equality. For a junction require expected junction identity before `unlinkSync(junction)`; for each source require expected regular non-reparse directory identity plus `readdirSync(source).length === 0` before non-recursive `rmdirSync(source)`; for each file require expected regular non-reparse identity before `unlinkSync(file)`. Missing, replaced, mismatched, reparse-observable, non-regular, non-directory, or non-empty paths are retained with probe failure, `manual-cleanup-required: true`, and exact retained paths.

Each standalone probe has one ordered public observation object with exactly these keys: `schema,status,probeId,platform,exercise,normalCase,substitutionCase,harnessCleanup,manualCleanupRequired,retainedPaths`. `schema` is respectively `execution-authority-creation-probe/v1` or `execution-authority-junction-probe/v1`; `status` is `PASS | FAIL | SKIP`; `probeId` is the UUID-owned identifier; `platform` is `process.platform`; `exercise` names the controlled workflow; `normalCase`, `substitutionCase`, and `harnessCleanup` use exact ordered keys `status,expectedIdentity,observedIdentity,refused,manualCleanupRequired,retainedPaths,proof`; identity snapshots expose ordered `dev,ino,modeType,expectedType` values with bigint fields serialized as decimal strings; `manualCleanupRequired` summarizes unresolved retained state; `retainedPaths` is an ordinal-sorted exact-path array. No standalone probe may return PASS unless `substitutionCase.status === "PASS"`, `refused === true`, `manualCleanupRequired === true` at refusal time, and retained-path proof succeeded before separate harness cleanup.

Creation substitution workflow: create a UUID-owned normal receipt target through the original-handle contract and clean it by matching identity; separately create a UUID-owned substitution target and freeze expected identity; rename that original to an exact UUID-owned retained-original path; exclusively create replacement bytes at the original pathname; call production cleanup with the frozen original identity and require `FAIL`, `manual-cleanup-required: true`, exact retained pathname, replacement bytes unchanged, and both replacement plus retained-original paths present. Only after recording refusal/retention proof, capture fresh identities and perform separate identity-checked `unlinkSync` cleanup for replacement and retained-original. Any unexpected identity refuses harness cleanup and leaves the exact manual path.

Junction substitution workflow: create one UUID-owned normal source/junction pair, prove target-path alias rejection, and clean it with identity-checked junction `unlinkSync` followed by identity-checked empty-source `rmdirSync`; separately create UUID-owned original-source, replacement-source, and junction paths, freeze the original junction identity, unlink only that known matching junction, recreate the same pathname as a junction to replacement-source, call production cleanup with the frozen original identity and require `FAIL`, `manual-cleanup-required: true`, exact retained junction/source paths, and proof that both sources and replacement junction remain. Only after recording refusal/retention proof, capture fresh identities and separately clean replacement junction then both empty sources with identity-checked nonrecursive primitives. Any unexpected identity or non-empty source refuses harness cleanup and leaves the exact manual path. If canonical junction creation privilege/policy blocks setup before either controlled case, emit the ordered SKIP observation with exact reason and safely clean only identity-matching created sources; all other setup, refusal, proof, or cleanup failures are FAIL, never SKIP.

No universal all-reparse claim is allowed from `lstat().isSymbolicLink()` alone. A Windows-native all-tag inspection helper requires a separate approved plan. Identity-before-unlink narrows but does not eliminate the final pathname TOCTOU window; retain that residual ceiling.

## Public Contracts

### Existing fence contract

The fence remains exactly:

```text
json execution-authority-envelope/v1
```

### Legacy branch — unchanged when `authorityClass` is absent

Exactly six fields, no others:

```text
selected_plan, authority_mode, allowed_scope, stop_conditions, artifact_path, artifact_schema_version
```

Supported `artifact_schema_version` values remain `phase-report/v1` and `phase-report-correction/v1`. Existing Report/Correction destination binding, normalized repository-relative path grammar, authority proof checks, error strings, exit code, and PASS object fields remain behavior-compatible.

### Temporary branch — exact top-level fields

Exactly these eight fields, no others:

```text
selected_plan, authority_mode, authorityClass, allowed_scope, scope_count, stop_conditions, stop_condition_count, artifact_receipt_schema_version
```

Constraints:

- `selected_plan`: normalized repo-relative path; exists; equals the validated plan.
- `authority_mode`: unchanged exact `{ "mode", "proof_path" }` object and proof behavior from the legacy branch.
- `authorityClass`: exact literal `temporary-artifact-set/v1`.
- `allowed_scope`: array length 1–8 of exact target records.
- `scope_count`: integer equal to `allowed_scope.length`, range 1–8.
- `stop_conditions`: non-empty array of unique non-empty strings.
- `stop_condition_count`: integer equal to `stop_conditions.length`.
- `artifact_receipt_schema_version`: exact literal `execution-temp-artifact-receipt/v1`.

Each `allowed_scope` target record has exactly these two keys and no others:

```text
artifact_path, artifact_schema_version
```

Target constraints:

- `artifact_path` is an exact absolute drive-qualified Windows path beneath `C:\Users\Admin\AppData\Local\Temp\opencode`.
- Drive must be `C:` after case-insensitive canonical comparison; root equality is rejected.
- Separators may normalize for comparison, but the accepted/public PASS output uses one documented canonical Windows form selected in VALIDATE.
- Reject UNC and device namespaces including `\\?\`, `\\.\`, and slash-equivalent forms.
- Reject empty, `.`/`..`, NUL-bearing, wildcard/glob-bearing, trailing-dot, trailing-space, colon-bearing non-drive, and alternate-data-stream components.
- Reject duplicate canonical targets case-insensitively and separator-insensitively.
- Reject Windows reserved DOS device basenames case-insensitively in every component, including `CON`, `PRN`, `AUX`, `NUL`, `CLOCK$`, `COM1`–`COM9`, `LPT1`–`LPT9`, extension-bearing forms such as `con.txt`, and applicable superscript aliases `COM¹`/`COM²`/`COM³` and `LPT¹`/`LPT²`/`LPT³` with or without extensions.
- Reject prefix-collision containment such as `...\opencode-evil\x`.
- `artifact_schema_version` is a non-empty versioned schema identifier bound to that exact target; A4.6 values are the four frozen artifact markers below.

### Receipt contract

Each successful target creation produces one `execution-temp-artifact-receipt/v1` evidence record with exactly these ordered keys:

```text
schema,artifactPath,artifactSchemaVersion,bytes,sha256,exclusiveCreate,regularNonReparse,readbackMatches,status
```

Field rules:

- `schema`: exact literal `execution-temp-artifact-receipt/v1`.
- `artifactPath`: deterministic normalized target display defined below; it is not canonical filesystem identity.
- `artifactSchemaVersion`: the target record's exact declared schema.
- `bytes`: non-negative integer byte count from the frozen write bytes and matching readback.
- `sha256`: lowercase 64-character hexadecimal SHA-256 of the frozen write bytes and matching readback.
- `exclusiveCreate`: exact boolean `true` only after exclusive create succeeds without overwrite.
- `regularNonReparse`: exact boolean `true` only after mandatory production realpath, component-wise `lstat`, ancestor, destination, and regular-file checks pass.
- `readbackMatches`: exact boolean `true` only when bytes read positionally through the still-open original `wx+` descriptor, byte count, exact EOF, schema marker, SHA-256, and exact usable path/handle `{ dev, ino, modeType }` checks match.
- `status`: exact literal `PASS`; no receipt is emitted for a failed or partial target.

Receipts are execution evidence only and never authorize or require another filesystem target.

### Temporary PASS output contract

When `authorityClass === "temporary-artifact-set/v1"`, successful direct validation prints one JSON object with exactly these ordered keys:

```text
status,authorityClass,selected_plan,mode,proof_path,scope_count,stop_condition_count,artifact_receipt_schema_version,artifact_paths
```

Rules:

- `status`: exact literal `PASS`.
- `authorityClass`: exact literal `temporary-artifact-set/v1`.
- `selected_plan`, `mode`, and `proof_path`: normalized legacy-compatible repository values.
- `scope_count` and `stop_condition_count`: validated input counts.
- `artifact_receipt_schema_version`: exact validated receipt schema.
- `artifact_paths`: ordered array matching `allowed_scope`; each entry is a deterministic normalized display path built from the prechecked approved-root display plus validated relative components, using backslashes in memory and JSON escaping only during serialization. This is display normalization, not canonical filesystem identity and not a recasing claim. Identity/containment decisions use the separately frozen real-root and per-target filesystem checks; PASS display must never be described as the canonical identity.
- With `authorityClass` absent, the existing legacy PASS object, key order, indentation, trailing newline, stdout, stderr, and exit status remain byte-for-byte unchanged.

### Executor creation contract

- Temporary lane: run exactly one initial full-envelope preflight before the first temporary side effect. Do not run a mid-phase or completion full-envelope rerun.
- Legacy Report/Correction lane: retain the initial, mid-implementation, and completion full-validator reruns unchanged.
- For each temporary target, immediately before creation: rerun target lexical exactness, reserved-device rejection, absence, approved-root lexical-chain `lstat`, freeze that precreate root identity as `rootReal`, then run safe ancestry/reparse and realpath containment checks.
- Create with exact `fs.openSync(path, "wx+")` semantics; never overwrite, truncate, rename over, clean up, or repair an existing destination. Keep the original descriptor open through write, flush, identity comparison, positional readback, EOF, bytes/schema/SHA-256 verification, and successful close.
- Before a receipt, while the original descriptor remains open, rerun the full approved-root lexical-chain and identity checks, require the postreadback root identity to equal frozen precreate `rootReal`, rerun target ancestry/reparse checks, component-boundary containment, destination `lstat` regular/non-reparse checks and destination realpath containment, compare the exact usable `{ dev, ino, modeType }` path tuple to the original-handle tuple, and read exact bytes positionally through the original descriptor from offset `0`. Close only after verification; never reopen the path. Emit the receipt only after close succeeds.
- Stop on any collision, partial prior set, alias/reparse finding, root drift, ancestry drift, target drift, receipt mismatch, or unauthorized target.
- Do not rerun the full envelope validator per temporary target; the required per-target precreate/postreadback routines are filesystem/identity checks after the one initial full-envelope preflight.

## A4.6 Reference Envelope and Acceptance Criterion

This is the exact target envelope A4.6 must be able to receive from a future fresh VALIDATE pass after this harness plan is VERIFIED. It is a reference fixture/acceptance criterion only; this plan must not edit A4.6.

```json execution-authority-envelope/v1
{
  "selected_plan": "process/features/casino-overhaul/active/visual-animation-assets_07-08-26/phase-02-controller-contract-authority-a4.6_PLAN_26-08-26.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": "process/features/casino-overhaul/active/visual-animation-assets_07-08-26/visual-animation-assets_AUTOPILOT_GOAL_10-08-26.md"
  },
  "authorityClass": "temporary-artifact-set/v1",
  "allowed_scope": [
    {
      "artifact_path": "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\phase02-controller-contract-schema-registry-v4.6.json",
      "artifact_schema_version": "phase02-controller-contract-schema-registry/v4.6"
    },
    {
      "artifact_path": "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\phase02-controller-contract-schema-registry-v4.6-provenance.json",
      "artifact_schema_version": "phase02-controller-contract-schema-registry-provenance/v4.6"
    },
    {
      "artifact_path": "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\phase02-controller-contract-schema-registry-v4.6-b4.5.3-cross-reference.json",
      "artifact_schema_version": "phase02-controller-contract-schema-registry-consumption-cross-reference/v4.6"
    },
    {
      "artifact_path": "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\phase02-controller-contract-schema-registry-v4.6-validator.py",
      "artifact_schema_version": "phase02-controller-contract-schema-registry-validator/v4.6"
    }
  ],
  "scope_count": 4,
  "stop_conditions": [
    "Any A4.6 destination already exists, aliases another path, or the four-target set is partially present.",
    "The approved temporary root or any existing ancestor/target is not regular, is reparse-observable, or resolves outside the approved root.",
    "Any source receipt, immutable plan-bound receipt, authority proof, selected-plan identity, target schema, or target path drifts.",
    "Any authorship step requires a forbidden semantic reread, compatibility rule change, unresolved requirement, or repair in place.",
    "Exclusive creation, close, readback, byte count, SHA-256, schema validation, or receipt emission fails for any target.",
    "Any repository source, repository test, Report, Correction, copy, build, browser, controller, harness, projector, or candidate execution is requested.",
    "Any Git staging, commit, push, deploy, network, provider, secret, dependency, external-service, irreversible, or cost-generating action is requested.",
    "Any write or execution target falls outside the exact four allowed_scope records or any standing hard stop is reached."
  ],
  "stop_condition_count": 8,
  "artifact_receipt_schema_version": "execution-temp-artifact-receipt/v1"
}
```

**Acceptance:** after implementation, the validator accepts this exact object only when embedded in the selected A4.6 plan by a fresh VALIDATE contract and all authority proof/selected-plan preconditions hold. This plan does not claim that acceptance now and does not create the four artifacts.

## Fixture Matrix

Create exactly **18 new Markdown envelope fixtures** beside the existing 10 legacy fixtures: **1 temporary pass fixture + 17 temporary negative fixtures**. Total fixture files after repair: **28** (3 pass, 25 negative). Keep the original 10 fixture bytes unchanged. Because exact original implementation bytes were not retained, compatibility is behavioral against all original 10 fixtures and current canonical legacy source semantics, not a fabricated pre-edit diff claim.

| New fixture | Expected | Required scenario |
|---|---:|---|
| `pass-temporary-artifact-set.md` | accept | Valid 1–8 target temporary branch, exact counts/schema/authority. |
| `fail-temp-wrong-root.md` | reject | Absolute target outside approved root. |
| `fail-temp-traversal.md` | reject | `..` or dot-segment target. |
| `fail-temp-duplicate-target.md` | reject | Case/separator-equivalent canonical target repeated. |
| `fail-temp-glob.md` | reject | `*`, `?`, class, brace, or globstar syntax. |
| `fail-temp-too-many.md` | reject | Nine targets. |
| `fail-temp-missing-receipt-schema.md` | reject | Missing `artifact_receipt_schema_version`. |
| `fail-temp-mixed-lane.md` | reject | Legacy `artifact_path`/`artifact_schema_version` top-level fields mixed into temporary branch. |
| `fail-temp-duplicate-key.md` | reject | Literal duplicate key in one JSON object. |
| `fail-temp-escaped-duplicate-key.md` | reject | Escaped-equivalent duplicate such as `authorityClass` and `authority\u0043lass`. |
| `fail-temp-wrong-scope-count.md` | reject | `scope_count` differs from array length. |
| `fail-temp-wrong-stop-count.md` | reject | `stop_condition_count` differs from array length. |
| `fail-temp-prefix-collision.md` | reject | `...\opencode-evil\x` prefix confusion. |
| `fail-temp-device-namespace.md` | reject | `\\?\`, `\\.\`, or equivalent device namespace. |
| `fail-temp-trailing-dot-space.md` | reject | A component ending in dot or space. Fixture/self-check must exercise both variants. |
| `fail-temp-ads.md` | reject | Colon/alternate-data-stream suffix after the drive. |
| `fail-temp-dos-device.md` | reject | Case-insensitive reserved DOS device basenames, including plain, extension-bearing, and applicable superscript-digit `COM`/`LPT` aliases; one fixture may carry multiple cases only if the fixture runner executes every embedded envelope case rather than stopping at one fence. |
| `fail-temp-reparse-seam.md` | reject | Injected or controlled Node-observable root/ancestor/destination junction, symlink, or reparse seam, including root-chain rejection before realpath and postreadback identity drift. |

The suite must also add self-check coverage for temporary-only escaped-equivalent duplicate decoding; all lexical variants grouped by one Markdown fixture (glob forms, device namespace forms, trailing dot/space, and DOS-device plain/extension/superscript forms); root-chain pre-realpath rejection; and complete postreadback revalidation. Fixture expectation naming remains `pass-*`/`fail-*`. If the existing runner validates only one envelope per Markdown file, `fail-temp-dos-device.md` must be a runner-owned multi-case fixture with explicit subcase iteration; otherwise split cases requires a return to PLAN because the exact fixture count is frozen at 28.

## Implementation Checklist

### Stage 0 — VALIDATE high-risk contract and evidence setup

- [ ] Invoke `vc-risk-evidence-pack` with risk class `permission, secret, or trust-boundary logic`; create the five colocated files under `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/`.
- [ ] Freeze exact receipt-record key order, temporary PASS output shape, and deterministic normalized Windows display form in the Validate Contract without changing the eight-field input contract above; do not call display canonical identity or claim recasing.
- [ ] Mark the existing Report and all five risk/evidence artifacts `REPAIR REQUIRED`/`REJECT`; remove or supersede every PASS/COMPLETE/APPROVE claim until fresh gates and independent EVL pass.
- [ ] Preserve `PRE_EDIT_BASELINE_UNAVAILABLE` and add `REPAIR_BASELINE_BYTES_UNRECOVERABLE`: true pre-edit implementation content/native receipts and exact repair-baseline before bytes were not retained and must not be fabricated. Treat the existing baseline and after manifests as the only historical path/hash observations; never claim they reconstruct missing bytes.
- [ ] Freeze the existing six-line empty `harness/evidence/repair.patch` byte-for-byte as failed historical evidence. Do not rewrite, repair, regenerate, or fabricate it. Record its status only as `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`; index it for history but exclude it from the implementation/evidence-integrity success conjunction.
- [ ] Capture direct native child-process stdout bytes, stderr bytes, and numeric exit status for every original legacy fixture before repair and after repair. Do not pipe through PowerShell text objects, `Out-String`, command substitution, newline normalization, encoding conversion, or JSON reserialization.
- [ ] Prove `fail-temp-dos-device.md` is absent before creation and the original 10 fixture bytes remain unchanged; current 17 temporary fixtures are repair-baseline inputs, not claimed pre-edit evidence.

### Stage 1 — Validator isolated dispatch and parser integrity

- [ ] In `.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`, isolate envelope extraction/duplicate-safe parse from branch validation.
- [ ] Preserve the legacy branch code path and its ordering/output; dispatch to it only when `authorityClass` is absent.
- [ ] Add the exact temporary branch field/key/count/schema checks, strict Windows lexical checks, canonical duplicate detection, and approved-root containment.
- [ ] Preserve legacy raw parse/rejection ordering exactly. Isolate decoded escaped-equivalent duplicate-key scanning to the selected temporary branch only; literal/escaped malformed input on the absent-`authorityClass` lane must continue to follow current canonical legacy rejection behavior/order.
- [ ] Reject Windows reserved DOS device basenames case-insensitively in every component, including plain, extension-bearing, and applicable superscript-digit aliases.
- [ ] Add the minimum injectable filesystem identity seam needed to test lexical approved-root-chain `lstat` before realpath, Node-observable root/ancestor/destination reparse rejection, and full postreadback revalidation without granting write interception or new production dependencies.
- [ ] Rework `createTemporaryArtifact` around the original `wx+` descriptor: exact write loop, flush, usable bigint `{ dev, ino, modeType }` freeze, full path postreadback checks while open, exact path/handle tuple equality, positional read loop from offset `0`, one-byte EOF probe, bytes/schema/SHA-256 checks, close-success gate, and receipt only after close. Remove close/reopen `readFileSync` verification.
- [ ] Preserve frozen-root equality and deterministic drift rejection. Add narrow deterministic checks for same-object tuple acceptance, path/handle tuple mismatch rejection, unusable all-zero identity rejection, and exact positional readback/EOF rejection; expose no generic write interceptor.
- [ ] Replace all probe/self-check cleanup using `fs.rmSync` or identity-blind unlink with one narrow Node-stdlib fail-closed cleanup routine: capture expected usable `lstat` identity/type after creation; immediately before cleanup re-observe and compare; use `unlinkSync` only for the verified junction or verified regular non-reparse file; use non-recursive `rmdirSync` only for the verified empty source directory; never use recursive removal.
- [ ] On cleanup absence/substitution/type/identity/non-empty mismatch, perform no deletion, fail the probe, and report `manual-cleanup-required` with the exact retained path(s). Preserve successful cleanup when identity/type still match.
- [ ] Keep one initial envelope validation entry point; expose no generic filesystem-writing API.

### Stage 2 — Fixtures and focused behavior proof

- [ ] Add exactly `fail-temp-dos-device.md`, bringing the new temporary fixture inventory to 18 and the complete fixture inventory to 28.
- [ ] Extend validator self-checks to cover grouped DOS-device variants, temporary-only escaped-equivalent duplicates, approved-root chain rejection before realpath, root/ancestry/destination drift after readback, same-object original-handle/path identity acceptance, original-handle/path identity mismatch rejection, unusable identity rejection, positional short-read/trailing-byte rejection, successful identity-checked creation cleanup, refused creation cleanup after identity substitution, successful junction-unlink/source-rmdir cleanup, and refused junction/source cleanup after substitution. Preserve the four existing cleanup target names; add exactly four original-handle/readback self-check targets, increasing the expected self-check count from 60 to exactly 64; add no fixture file.
- [ ] Run red-first evidence for original-handle identity/readback and both standalone controlled-substitution workflows, then green the minimum validator change.
- [ ] Run the complete unchanged 28-fixture suite plus exactly 64 self-checks. Run all original 10 fixtures individually through direct native child-process capture and compare before-repair to after-repair stdout bytes, stderr bytes, and numeric exit status. For legacy semantic compatibility also inspect current canonical legacy branch validation order/error source; do not substitute a transformed two-pass-fixture oracle.

### Stage 3 — Audit skill, protocols, and prompt parity

- [ ] Update `.claude/skills/vc-audit-vc/SKILL.md` with the discriminator dispatch, both branch contracts, fixture counts, and accurate filesystem-enforcement ceiling.
- [ ] Update `process/development-protocols/vc-system-behavior/08-validate.md` so VALIDATE emits the legacy six-field branch by default and emits the exact temporary branch only for 1–8 approved absolute temp targets; require the risk evidence pack.
- [ ] Update `process/development-protocols/vc-system-behavior/09-execute.md` with branch-exact invocation semantics: legacy retains initial/mid/completion full-validator reruns; temporary performs exactly one initial full-envelope preflight plus complete per-target precreate/postreadback checks, exclusive creation, receipt evidence, and no fifth artifact.
- [ ] Mirror the same rules in `.claude/agents/vc-validate-agent.md` and `.codex/agents/vc-validate-agent.toml`.
- [ ] Mirror the same rules in `.claude/agents/vc-execute-agent.md` and `.codex/agents/vc-execute-agent.toml`.
- [ ] In both EXECUTE mirrors, change the unconditional mid-implementation progress-note envelope paragraph to explicitly apply only to the absent-`authorityClass` legacy Report/Correction lane. For `authorityClass === "temporary-artifact-set/v1"`, write the progress note without a full-envelope rerun and continue only under the already-passed initial preflight plus per-target checks.
- [ ] Preserve the already branch-specific completion paragraph, and re-review it with the repaired midpoint paragraph. Preserve current Report/Correction initial, mid, and completion full-validator invocation points and behavior for the legacy branch; temporary mode uses exactly one initial full preflight plus per-target precreate/postreadback checks and no mid/completion full rerun.

### Stage 4 — Test context and final evidence

- [ ] Update `process/context/tests/all-tests.md` with the exact fixture command, direct native all-10-legacy capture command, expected 28-fixture composition, reparse evidence limits, targeted ESLint command, and known missing frontmatter-validator status.
- [ ] Reuse the exact bounded 20-file `harness/evidence/` inventory below. Preserve raw stdout, raw stderr, and numeric exit receipts for every legacy fixture, fixture suite, syntax/probes/lint/typecheck/tests/Tier-1/risk/current-state gate; add no evidence path.
- [ ] Repurpose `harness/evidence/independent-evl.json` and `index.json` to carry the exact current-state review lane defined below. Do not broaden scope or create a replacement patch artifact.
- [ ] Reset and complete the Report, all five risk artifacts, `harness/evidence/index.json`, and `harness/evidence/independent-evl.json` with truthful `REPAIR REQUIRED`/`FAIL`/`REJECT` state until evidence is fresh. Explicitly retract current false ruled-out/PASS claims for temporary midpoint cadence, junction/substitution cleanup, and creation cleanup. Adversarial findings may claim only the exact freshly exercised Node-observable and Windows cases; universal all-reparse, race elimination, final pathname TOCTOU elimination, and historical byte provenance remain unruled ceilings.
- [ ] Obtain fresh independent EVL `APPROVE` in `harness/review-decision.json`; do not report DONE, COMPLETE, PASS evidence summary, or VERIFIED before it.
- [ ] Run all gates in Verification Evidence and capture every command's raw streams and exit status, including expected non-zero known-gap commands. ESLint evidence must either use a fresh exact native process invocation with unmodified Buffer capture or truthfully record the previously attempted direct `npx.cmd` `EINVAL`; a shell fallback cannot be called the exact requested command.
- [ ] Compare complete repair-baseline and repair-after manifest entry sets. Derive `differingPaths`, `newPaths`, and `deletedPaths` from membership and hashes; require all changed/new paths to be in the exact authorized implementation/documentation/risk/Report allowlist, no unexpected path, and `deletedPaths: []`.
- [ ] Require independent exhaustive source review of the complete current bytes for every path in sorted `differingPaths + newPaths`, including the two residual repairs. State explicitly that this proves current-state acceptability, not historical patch provenance.

## Touchpoints

### Implementation/documentation touchpoints — exactly 27 files

| # | File | Action |
|---:|---|---|
| 1 | `.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs` | Repair branch-isolated parsing, DOS-device rejection, root-chain ordering, postreadback checks, display semantics, and self-checks. |
| 2 | `.claude/skills/vc-audit-vc/SKILL.md` | Repair audit usage and compatibility contract. |
| 3 | `process/development-protocols/vc-system-behavior/08-validate.md` | Repair canonical VALIDATE behavior. |
| 4 | `process/development-protocols/vc-system-behavior/09-execute.md` | Repair canonical branch-specific EXECUTE behavior. |
| 5 | `.claude/agents/vc-validate-agent.md` | Repair Claude VALIDATE prompt. |
| 6 | `.codex/agents/vc-validate-agent.toml` | Mirror repaired VALIDATE prompt. |
| 7 | `.claude/agents/vc-execute-agent.md` | Repair Claude EXECUTE prompt. |
| 8 | `.codex/agents/vc-execute-agent.toml` | Mirror repaired EXECUTE prompt. |
| 9 | `process/context/tests/all-tests.md` | Repair durable harness-test guidance. |
| 10–27 | `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/{18 fixture names from Fixture Matrix}` | Preserve the current 17 temporary fixtures and create exactly `fail-temp-dos-device.md`; total temporary fixtures 18. |

### High-risk status/evidence touchpoints — exactly 5 files

- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json`

### Raw gate evidence subtree — exactly 20 files

All paths are under `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/`:

1. `index.json`
2. `pre-edit-baseline.json`
3. `repair-baseline-manifest.json`
4. `repair-after-manifest.json`
5. `repair.patch`
6. `legacy-before.json`
7. `legacy-after.json`
8. `fixture-suite.json`
9. `validator-syntax.json`
10. `temporary-pass.json`
11. `creation-probe.json`
12. `junction-probe.json`
13. `eslint.json`
14. `typecheck-core.json`
15. `npm-test.json`
16. `tier1-audits.json`
17. `frontmatter-known-gap.json`
18. `risk-gates.json`
19. `diff-gates.json`
20. `independent-evl.json`

`pre-edit-baseline.json` keeps exactly ordered keys `schema,status,reason,repairBaselineDefinedAt`; `schema` remains `execution-authority-pre-edit-baseline/v1`, `status` remains `PRE_EDIT_BASELINE_UNAVAILABLE`, and `reason` must add the exact token `REPAIR_BASELINE_BYTES_UNRECOVERABLE` while stating that neither true pre-edit content/native receipts nor exact repair-baseline before bytes were retained and none may be fabricated. Both manifest files keep ordered keys `schema,baselineKind,generatedAt,entries`; `schema` is `execution-authority-repair-manifest/v1`, `baselineKind` is respectively `current-repair-baseline` or `repair-after`, and each entry has ordered `path,kind,bytes,sha256,gitTrackingState`, sorted by ordinal path. The existing `repair.patch` is frozen byte-for-byte as failed historical evidence: exact header `PRE_EDIT_BASELINE_UNAVAILABLE\n`, schema `execution-authority-repair-patch/v1`, scope basis `current-repair-baseline-to-repair-after`, and empty `entries`. Never rewrite or fabricate it. Its only acceptable amended classification is `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`; it remains indexed and excluded from the new success conjunction. The manifests and exhaustive current-state source review replace only the reconstructable patch PASS requirement; they do not repair the provenance gap.

Every single-command receipt JSON has exactly ordered keys `schema,command,cwd,startedAt,finishedAt,exitCode,stdoutEncoding,stdoutBase64,stderrEncoding,stderrBase64,status`; `schema` is `execution-authority-command-receipt/v1`, `command` is the exact argv display string, `cwd` is the normalized absolute working directory, timestamps are ISO 8601 UTC strings, `exitCode` is an integer (including expected non-zero known-gap results), encodings are exact literal `base64`, and `status` is `PASS`, `FAIL`, or `SKIP`. Capture commands through a Node standard-library evidence runner using `spawnSync(process.execPath, argv, { cwd, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })` for Node scripts and `spawnSync(npmCommand, argv, { cwd, encoding: null, shell: false, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })` for npm/npx, where `npmCommand` is `npm.cmd` and `npxCommand` is `npx.cmd` on Windows. If native direct invocation returns a process error such as Windows `EINVAL`, that attempt is not PASS; either retain it as truthful failed variance evidence or perform a fresh exact command through a native process mechanism whose recorded `command` matches the actual invocation and whose stdout/stderr remain unmodified Buffers. A `cmd.exe` fallback may be separately recorded but cannot be labelled as the exact direct `npx eslint ...` command. Require `result.error` absent, `result.status` an integer, and `result.stdout`/`result.stderr` Buffers; base64-encode those Buffers directly. Never use PowerShell pipelines, `Out-String`, redirected shell text, `execSync` string decoding, command substitution, JSON reserialization of child output, or newline/encoding normalization. Aggregate receipt files (`legacy-before.json`, `legacy-after.json`, `tier1-audits.json`, `risk-gates.json`, `diff-gates.json`) have exactly ordered keys `schema,records,status`; `schema` is `execution-authority-command-receipt-set/v1`, and each `records` entry uses the same ordered single-command receipt keys. Legacy aggregate records are sorted by the original 10 fixture filenames and include every pass and rejection fixture. `index.json` has ordered keys `schema,baselineStatus,repairBaselineStatus,manifestBefore,manifestAfter,repairPatch,repairPatchStatus,receipts,independentReview,integrityConjunction,status`; `schema` is `execution-authority-evidence-index/v1`, `baselineStatus` is `PRE_EDIT_BASELINE_UNAVAILABLE`, the three manifest/patch values and `independentReview` are exact task-folder-relative evidence paths, and `status` remains `REPAIR REQUIRED` until independent EVL APPROVE; `receipts` lists the 14 command-receipt/aggregate paths (`legacy-before.json` through `diff-gates.json`, excluding the five baseline/manifest/patch files and `independent-evl.json`) in the inventory order. `independent-evl.json` has ordered keys `schema,reviewer,reviewedAt,baselineLimitation,currentStateReview,legacyBehavioralCompatibility,securityFindings,gateReceiptsReviewed,decision,rationale`; `decision` remains `REJECT` until a fresh independent review returns `APPROVE`.

`index.json` values are exact: `schema: "execution-authority-evidence-index/v1"`; `baselineStatus: "PRE_EDIT_BASELINE_UNAVAILABLE"`; `repairBaselineStatus: "REPAIR_BASELINE_BYTES_UNRECOVERABLE"`; exact task-folder paths for both manifests, the frozen patch, and independent EVL; `repairPatchStatus: "UNAVAILABLE_ACCEPTED_BY_AMENDMENT"`; `receipts` in the existing fixed order with ordered `path,bytes,sha256`; `integrityConjunction` with exactly ordered keys `manifestEntrySetsCompared,changedSetDerivedFromHashes,exactAllowlist,noDeletions,independentExhaustiveReview,legacy10ByteComparison,securityAndRegressionGates,riskGate,repairPatchIncluded`, where the first eight are booleans and `repairPatchIncluded` is exact `false`; and final `status: "PASS" | "FAIL"`. `status` may be `PASS` only when the first eight conjunction values are `true`, `repairPatchIncluded` is `false`, `repairPatchStatus` has the amended value above, and independent EVL decision is `APPROVE`. The frozen patch itself never becomes PASS.

`independent-evl.json` keeps schema `execution-authority-independent-evl/v1` and has exactly ordered keys `schema,status,decision,baselineStatus,repairBaselineStatus,repairPatchStatus,manifestComparison,reviewedPaths,gateResults,residualGaps,reason,reviewer,timestamp`. `status` is `PASS | FAIL | NOT_RUN`; `decision` is `APPROVE | REJECT`; the three status fields use the exact literals above. `manifestComparison` has exactly ordered keys `baselineEntryCount,afterEntryCount,differingPaths,newPaths,deletedPaths,unexpectedPaths,allowlistStatus`, with all path arrays ordinal-sorted and `allowlistStatus: "PASS" | "FAIL"`. `reviewedPaths` is an ordinal-sorted array with exactly one record per path in the union of `differingPaths` and `newPaths`; each record has ordered keys `path,bytes,sha256,reviewStatus,findings`, where `reviewStatus: "PASS" | "FAIL"` and `findings` is an array of strings. `gateResults` has exactly ordered boolean keys `legacy10NativeByteComparison,temporaryFixtures,rootIdentityFreeze,legacyOnlyCompletionRerun,securityProbes,agentParity,protocolWiring,eslint,typecheck,npmTest,riskPack`. `residualGaps` must include `PRE_EDIT_BASELINE_UNAVAILABLE`, `REPAIR_BASELINE_BYTES_UNRECOVERABLE`, the universal Windows reparse-tag ceiling, residual TOCTOU, and absent frontmatter validator. APPROVE is allowed only when manifest comparison has no deletion/unexpected path, every reviewed path and gate result passes, and the reason explicitly says current-state integrity is accepted despite unavailable historical patch provenance.

Because `process/` and harness paths may be Git-ignored, retention is filesystem/task-folder retention, not Git retention: after every evidence write, require `lstat` regular-file/non-symlink status, reopen with `fs.readFileSync`, verify bytes/SHA-256 against the in-memory serialized bytes, and include the path/hash in `index.json`; the final gate reopens and parses every exact evidence path. Do not stage, force-add, commit, copy outside the task folder, or change `.gitignore`. Before any receipt is persisted, run a fail-closed secret scan over decoded stdout/stderr and reject writing if it matches case-insensitive secret-bearing environment names (`TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, `API_KEY`, `PRIVATE_KEY`, `AUTHORIZATION`, `COOKIE`, `SESSION`) followed by `:` or `=`, a PEM private-key header, or URI userinfo credentials. Commands must not print environment listings or file contents outside the exact harness/plan evidence surfaces. Redaction is forbidden because it would destroy raw-byte evidence; on a match, keep the bytes only in memory, emit no receipt, stop, and require a safer non-secret-bearing command.

**Planned repair total:** 53 execution/evidence files: 27 harness/docs/fixtures + 5 risk files + 20 bounded raw-evidence files + 1 canonical Report. The selected plan is PLAN/VALIDATE bookkeeping and is not counted as repair implementation, but the legacy envelope validator requires `selected_plan` to be covered by `allowed_scope`; therefore the final envelope has exactly 54 scope entries: the 53 repair execution/evidence files plus this selected plan as validation/status bookkeeping. The Autopilot proof remains read-only. No broad `harness/evidence/**` authority exists beyond the exact 20 paths above.

### Read-only references

- `process/context/all-context.md`
- `process/context/active-plan.md`
- `process/development-protocols/all-development-protocols.md`
- `process/development-protocols/implementation-standards.md`
- `process/development-protocols/plan-lifecycle.md`
- `process/development-protocols/vc-system-behavior/01-overview.md`
- `process/development-protocols/vc-system-behavior/07-plan.md`
- `process/development-protocols/vc-system-behavior/12-reference.md`
- `.claude/skills/vc-generate-plan/SKILL.md`
- `.claude/skills/vc-risk-evidence-pack/SKILL.md`
- A4.6 and historical Phase 02 plan paths named under Out of scope.

### Files requiring no change

- `package.json`, `package-lock.json`, `tsconfig.core.json`, and `eslint.config.js`.
- All existing 10 execution-authority fixture files and their `proof/` files.
- `.claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs`.
- `.claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs`, `validate-skills.mjs`, `validate-guide-sync.mjs`, `validate-protocol-wiring.mjs`, `validate-seeds.mjs`, `validate-kit-portability.mjs`, and `validate-skill-invocation-wiring.mjs`.
- `.claude/agents/vc-tester.md`, `.codex/agents/vc-tester.toml`, all non-VALIDATE/non-EXECUTE agents, `AGENTS.md`, `CLAUDE.md`, and `README.md`.
- Every application source/test/configuration file and every A4.6/historical Phase 02 artifact.

## Blast Radius

| Area | Files | Failure mode | Risk control |
|---|---:|---|---|
| Authority validator | 1 | Legacy plans blocked or over-authorized; temp path escape. | Isolated dispatch, legacy byte oracle, exhaustive negative matrix. |
| Fixtures/self-checks | 18 temporary + existing 10 legacy read-only | False PASS from incomplete adversarial grammar. | 28-fixture composition, grouped DOS-device/identity self-checks, native direct validation of all 10 legacy fixtures. |
| Audit skill/protocol | 3 | Docs diverge from executable contract. | Exact schema tables and protocol wiring audit. |
| Agent parity | 4 | Claude/Codex issue different authority or executor behavior. | Agent parity audit plus current-state review. |
| Test context | 1 | Future agents skip security/reparse evidence. | Exact commands and known-gap wording. |
| Risk evidence | 5 + 20 raw evidence files | High-risk completion claimed without fresh adversarial proof or raw receipts. | `vc-risk-evidence-pack`, bounded raw stream receipts, exact manifest current-state review, frozen failed patch provenance marker, and independent EVL gate. |

**Risk class:** HIGH — permission/trust-boundary and filesystem authority logic.

**Packages/services:** agent harness only; no runtime application package or service.

**Data/deployment:** no database, network, provider, production, build artifact, or deployment mutation.

## Risk Predictions

| Prediction | Consequence | Mitigation/evidence |
|---|---|---|
| Adding `authorityClass` to shared required fields breaks legacy envelopes. | Every current Report/Correction plan blocks. | Presence-based dispatch before branch-specific exact-key checks; legacy direct byte oracle. |
| `JSON.parse` collapses escaped-equivalent keys. | Attacker overrides temporary discriminator or target list; global hardening could drift legacy rejection order. | Select temporary lane without changing absent-discriminator legacy handling; decode/compare property tokens only inside temporary branch; dedicated escaped fixture/self-check plus all-10 legacy native receipts. |
| Naive prefix check accepts `opencode-evil`. | Write authority escapes approved temp root. | Path-component containment and prefix-collision fixture. |
| Windows aliases reserved DOS device names or superscript forms. | Target resolves unexpectedly or cannot be safely created/read. | Case-insensitive per-component device basename rejection, including extensions and applicable superscript aliases; dedicated multi-case fixture/self-check. |
| `realpath` follows an alias before `lstat` observes the lexical root. | Approved root or ancestor identity is silently redirected. | Lexical root-chain `lstat` before realpath, controlled root/ancestor seam, and live Windows evidence. |
| Check/create or cleanup race remains around pathname operations. | Target is substituted after validation/readback or between cleanup identity check and unlink. | Immediate checks, exclusive create, complete postreadback revalidation, identity/type capture plus immediate pre-unlink equality, non-recursive primitives only, mismatch refusal with `manual-cleanup-required`, and explicit residual TOCTOU ceiling. |
| Repair-baseline bytes are unrecoverable. | A fabricated patch could falsely claim provenance and hide unauthorized changes. | Preserve both unavailable markers, freeze empty `repair.patch` as failed history, derive changed/new/deleted sets from manifests, enforce exact allowlist/no deletions, and require exhaustive independent current-state source review. |
| Unconditional midpoint preflight survives in EXECUTE mirrors. | Temporary execution violates its exactly-one-full-preflight contract despite branch-specific completion wording. | Make both midpoint paragraphs legacy Report/Correction only and cover midpoint plus completion paragraphs in parity/current-state review. |
| Receipt becomes an implicit extra file. | Scope silently widens to fifth artifact. | Evidence-only receipt contract and tests/docs explicitly forbidding receipt target creation. |
| Prompt mirrors drift. | One executor bypasses checks. | Claude/Codex parity audit and protocol wiring commands. |

## Stop Conditions

EXECUTE stops and returns to PLAN/VALIDATE if any occurs:

1. Legacy pass fixture direct stdout/exit behavior changes when `authorityClass` is absent.
2. The exact temporary schema, A4.6 reference target paths/schemas, or eight stops require reinterpretation rather than mechanical implementation.
3. A required fix touches application source, A4.6, historical Phase 02, package metadata, lockfile, or any file outside Touchpoints.
4. A new dependency, native binary requirement, generic write interceptor, or package script is needed.
5. Windows reparse safety cannot be demonstrated with manual/native evidence or a deterministic injectable seam plus an explicit ceiling.
6. Any fixture expected to reject passes, any fixture expected to pass rejects, or count/parity output is ambiguous.
7. Risk evidence pack is missing, incomplete, or not explicitly approved.
8. The frozen `repair.patch` bytes change, either unavailable marker is omitted, manifest comparison reports a deletion/unexpected path, any differing/new path is not exhaustively reviewed, or `index.json` claims patch provenance PASS.
9. Either EXECUTE mirror still applies a mid-phase or completion full-envelope rerun to the temporary lane; any probe cleanup uses `rmSync`, recursive deletion, identity-blind unlink/rmdir, or deletes after an identity/type/non-empty mismatch; or cleanup substitution is not reported as probe failure with `manual-cleanup-required`.
10. Any Git commit/push/deploy, network/provider/secret, external-service, irreversible, destructive, or cost-generating action is requested.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `node --check .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs` — validator parses under Node. | Fully-Automated | AC-02, AC-03, AC-07 |
| `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope` — exactly 28 fixtures (3 pass, 25 negative) and exactly 64 self-checks meet expectations, including DOS-device aliases, frozen-root drift rejection, usable/mismatched/unusable original-handle identity, positional short-read/trailing-byte rejection, temporary one-full-preflight cadence, and four deterministic cleanup targets. Raw stdout/stderr/exit goes to `harness/evidence/fixture-suite.json`. | Fully-Automated | AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-08, AC-11 |
| Direct native legacy validation: invoke Node as a child process separately against every original 10 fixture, capture raw stdout/stderr buffers and numeric exit status without PowerShell transformation into `legacy-before.json` and `legacy-after.json`, and require exact before/after equality per fixture. Pair with current canonical legacy source-order review because `PRE_EDIT_BASELINE_UNAVAILABLE` forbids an original-diff claim. | Fully-Automated | AC-01, AC-07, AC-09 |
| Direct temporary pass validation against `pass-temporary-artifact-set.md`; require PASS with exact temporary summary and deterministic normalized display paths, with no canonical-identity/recasing claim or legacy artifact fields. Raw receipt goes to `temporary-pass.json`. | Fully-Automated | AC-02, AC-03, AC-04, AC-06 |
| Targeted ESLint: fresh exact `npx eslint .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs` with native process semantics, actual invocation recorded, unmodified Buffer capture, and zero exit; a direct `npx.cmd` `EINVAL` attempt or differently labelled `cmd.exe` fallback is variance evidence, not this PASS. | Fully-Automated | AC-10 |
| `git diff --check -- .claude/skills/vc-audit-vc process/development-protocols/vc-system-behavior/08-validate.md process/development-protocols/vc-system-behavior/09-execute.md .claude/agents/vc-validate-agent.md .claude/agents/vc-execute-agent.md .codex/agents/vc-validate-agent.toml .codex/agents/vc-execute-agent.toml process/context/tests/all-tests.md process/general-plans/active/execution-authority-temp-artifact-set_26-08-26` — no whitespace errors. | Fully-Automated | AC-08, AC-10 |
| Tier-1 `vc-audit-vc`: `node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-seeds.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs`. Report each result separately. | Fully-Automated | AC-08, AC-10 |
| `node .claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs` — known absent script; command must be run/reported as module-not-found and **not passed**, never counted green. | Known-Gap | AC-08 |
| `npm run typecheck:core` — bounded core type lane remains green. | Fully-Automated | AC-10 |
| `npm test` — full Vitest regression remains green. | Fully-Automated | AC-10 |
| Standalone UUID-owned Windows junction probe executes both normal alias rejection/identity-checked nonrecursive cleanup and live unlink/recreate substitution refusal, records the exact ordered observation fields, proves `manualCleanupRequired: true` and exact retained paths before separate identity-checked harness cleanup, and permits SKIP only for junction privilege/policy setup inability. Raw receipt goes to `junction-probe.json`. | Hybrid | AC-04, AC-05, AC-09 |
| Standalone UUID-owned creation probe proves original `wx+` descriptor identity, positional readback/EOF, collision refusal, normal cleanup, and a live rename-and-replace substitution refusal with exact retained-path/unchanged-byte proof before separate identity-checked harness cleanup; it cannot SKIP and must not use A4.6 targets. Raw receipt goes to `creation-probe.json`. | Hybrid | AC-05, AC-06, AC-09 |
| `vc-risk-evidence-pack` review of `harness/{risk-gate,context-snippets,verification,review-decision,adversarial-validation}.json`, raw-evidence index, manifests, frozen failed patch, and receipts; explicit fresh independent EVL APPROVE is required. | Agent-Probe | AC-09 |
| Exact current-state integrity lane: compare complete manifest entry sets; derive sorted differing/new/deleted sets from membership and SHA-256; require exact allowlist, no unexpected path, no deletion; independently inspect complete current bytes of every differing/new path; verify both residual fixes; record both unavailable markers and the provenance ceiling in `independent-evl.json`. `index.json` may PASS only with `repairPatchStatus: "UNAVAILABLE_ACCEPTED_BY_AMENDMENT"` and `repairPatchIncluded: false`. | Agent-Probe | AC-05, AC-08, AC-09, AC-10 |
| Freeze check: SHA-256 and bytes of the existing empty `repair.patch` remain equal to the PLAN-entry historical artifact; any rewrite fails. The artifact remains indexed as failure/history and cannot satisfy or poison the amended success conjunction. | Fully-Automated | AC-09 |

## Test Infra Improvement Notes

- The existing fixture runner can assert accept/reject behavior and validator summaries; keep it rather than adding a framework.
- Reparse and cleanup coverage has a platform/race ceiling. Use the existing injected filesystem-observation seam for deterministic identity substitution and cleanup-refusal checks plus controlled Windows live probes. Add no fixture file. Add a Windows-native reparse-tag or handle-relative deletion helper only in a separately approved plan if future authority requires universal tag or stronger final-TOCTOU guarantees.
- The prescribed agent frontmatter validator is absent. Report it as not passed; creating it is outside this plan.
- No receipt file or generic write-interception layer is added. If future callers need machine-persisted receipts, define that as a separately authorized evidence-artifact contract.

## Change Management

- Any proposed top-level temporary field change, receipt-schema change, A4.6 target change, or additional authority class returns to PLAN.
- Any legacy output/error difference is a release blocker, not an accepted concern.
- Any need to edit files listed under Files requiring no change returns to PLAN.
- VALIDATE may refine only test command details, exact PASS summary/receipt key order, and evidence mechanics without changing the public input contracts or scope.

## Resume and Execution Handoff

- **Selected plan file:** `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`
- **Last completed phase or step:** prior midpoint-cadence and cleanup repairs exist locally, but AC-05/AD-03A remain unimplemented: `createTemporaryArtifact` currently opens with `wx`, closes before path validation, and reopens with `readFileSync`; standalone creation/junction probe outputs record only happy-path cleanup and do not record controlled substitution refusal. Current Report/verification/adversarial PASS and ruled-out claims for those behaviors are superseded and pending fresh evidence.
- **Validate-contract status:** BLOCKED placeholder; every prior PASS contract/envelope is invalidated by this completed amendment. Fresh VALIDATE owns the replacement contract and must not reuse or infer execution authority from historical text.
- **Validated amendment input receipt:** `175364` bytes / SHA-256 `3567b6e5c1a9ed3223959d02b6eaeddce08308aeb633321e2f5e765afe84e971`; supplied and accepted as the sole PLAN input. The final amended receipt is returned in the PLAN handoff.
- **Supporting context loaded:** `process/context/all-context.md`, `process/context/active-plan.md`, `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`, `process/development-protocols/all-development-protocols.md`, `implementation-standards.md`, `plan-lifecycle.md`, `vc-system-behavior/{07-plan,08-validate,09-execute,12-reference}.md`, `.claude/skills/vc-generate-plan/SKILL.md`, `.claude/skills/vc-risk-evidence-pack/SKILL.md`, validator, all current fixtures, current Report, all five risk artifacts, and Claude/Codex VALIDATE+EXECUTE prompts.
- **Fresh-agent next step:** enter fresh VALIDATE with this exact selected plan. Re-run V1–V7 against current implementation/evidence; validate unchanged exact 29 writable paths and 20-file evidence inventory; accept provenance only through `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`; mechanically cover midpoint branch qualification, fail-closed identity-checked cleanup, four new self-checks, fresh probes/gates, exact nine-path current-state review, and a new independent EVL. Do not execute A4.6.
- **EXECUTE entry condition:** only after a fresh Validate Contract is PASS (or explicitly accepted CONDITIONAL), a newly emitted legacy Report envelope passes, all five status artifacts are in honest pre-repair `REJECT` state, and exactly this plan is selected.
- **Post-repair handoff:** fresh EVL reruns every mandatory gate from raw receipts and performs independent current-state/security review. Only after EVL PASS, risk `APPROVE`, truthful Report completion, and plan `VERIFIED` may separate A4.6 V1–V7 begin.
- **Unresolved decisions:** `0`. PLAN resolves both blockers mechanically. VALIDATE may verify mechanics and exact commands but may not weaken DOS-device aliases, root-chain-before-realpath ordering, frozen-precreate-root equality, full postreadback checks, temporary-only decoded duplicate hardening, branch-specific rerun counts, identity-before-cleanup, non-recursive cleanup, mismatch refusal/manual-cleanup-required, deterministic-display wording, raw-native evidence, frozen historical patch, or status rollback.

## PLAN Amendment Decision — Unrecoverable Repair Baseline

- **Decision:** accept no fabricated historical patch. Preserve `PRE_EDIT_BASELINE_UNAVAILABLE`; add `REPAIR_BASELINE_BYTES_UNRECOVERABLE`.
- **Frozen historical artifact:** `harness/evidence/repair.patch` remains exactly `160` bytes / SHA-256 `33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`. It remains failed history, is indexed as `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`, is excluded from the amended success conjunction, and is never rewritten.
- **Replacement proof:** exact baseline/after manifest entry-set comparison; hash-derived differing/new/deleted sets; exact allowlist and no-deletion enforcement; exhaustive independent review of complete current bytes for every differing/new path; legacy10 native byte equality; all temporary security fixtures/probes; Claude/Codex parity; protocol wiring; exact ESLint invocation evidence; typecheck; full tests; risk gates; and fresh independent EVL.
- **Residual provenance:** current-state review can approve the implementation but cannot recover or prove missing repair-baseline before bytes. Both unavailable markers remain in every final decision surface.
- **Implementation repairs still required:** both EXECUTE mirrors must make the midpoint full-envelope rerun explicitly legacy Report/Correction only; validator creation, junction, and self-check cleanup must capture and immediately verify expected identity/type, use only `unlinkSync` plus non-recursive `rmdirSync`, preserve safe success cleanup, and refuse substituted/mismatched cleanup with probe failure and `manual-cleanup-required`.
- **Scope decision:** no new implementation, evidence, dependency, application, A4.6, Git, or deployment path. Reuse the authorized `independent-evl.json` and `index.json` paths.
- **Public contract decision:** all temporary envelope schema, path grammar, security checks, PASS/receipt key orders, legacy compatibility requirements, and A4.6 reference requirements remain unchanged.
- **Gate:** `REPAIR REQUIRED` / `REJECT` until both implementation repairs, fresh exact gates, amended current-state integrity PASS, and independent EVL `APPROVE` exist.

## Invalidated Prior Validate Contract — Historical, Non-Executable

Status: REJECT
Date: 2026-08-26
date: 2026-08-26
generated-by: outer-pvl
invalidated-by: PLAN repair after independent review REJECT

**Gate: BLOCKED** — this historical contract is retained only as audit context. The amendment changes security scope and public proof requirements; none of the prior PASS findings, envelope authority, or execution approval remains valid.

### Layer 1 dimensions

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

### Layer 2 sections

| Layer 2 sections | Status |
|---|---|
| Stage 0 — VALIDATE high-risk contract and evidence setup | PASS |
| Stage 1 — Validator isolated dispatch and parser integrity | PASS |
| Stage 2 — Fixtures and focused behavior proof | PASS |
| Stage 3 — Audit skill, protocols, and prompt parity | PASS |
| Stage 4 — Test context and final evidence | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 9 PASSes**

**Net Gate: PASS**

### VALIDATE decisions and plan fixes

1. Receipt records use exactly this ordered key set: `schema,artifactPath,artifactSchemaVersion,bytes,sha256,exclusiveCreate,regularNonReparse,readbackMatches,status`.
2. Temporary PASS output uses exactly this ordered key set: `status,authorityClass,selected_plan,mode,proof_path,scope_count,stop_condition_count,artifact_receipt_schema_version,artifact_paths`.
3. Each temporary `artifact_paths` entry is a normalized native absolute Windows path built from the `fs.realpathSync.native` approved-root result plus validated relative components. Preserve the drive letter returned by realpath, use native backslashes in memory, and apply JSON escaping only at serialization.
4. With `authorityClass` absent, preserve the legacy PASS output byte-for-byte, including ordered keys, indentation, trailing newline, stdout/stderr split, and exit status.
5. Reparse evidence uses a read-only injectable Node-standard-library filesystem observation seam for deterministic tests plus a disposable Windows junction integration probe when privilege permits. A privilege/policy skip is recorded as `SKIP` and a known gap, never PASS. Mandatory production realpath, component-wise `lstat`, ancestor, containment, destination, and regular-file checks remain required.
6. Added the task-folder Report destination and `phase-report/v1` legacy execution envelope required for this repository-edit execution lane.
7. Initialized all five high-risk evidence artifacts. Their preparatory structure is valid; verification remains pending and `review-decision.json` remains `REJECT` until EXECUTE and fresh review complete.

### Layer 1 findings

| Finding | Severity | Proposed fix |
|---|---|---|
| Harness-only repository edits fit the current Node 24 runtime and require no app/container/deploy change. | PASS | — |
| Every developed authority surface has deterministic fixture/self-check coverage; Windows junction creation remains a bounded hybrid probe. | PASS | — |
| The temporary branch is a public harness-contract addition, but absent-discriminator legacy behavior is frozen byte-for-byte and all mirrors/consumers are explicit. | PASS | — |
| Filesystem write authority is high-risk; exact paths, exclusive create, duplicate-safe parsing, realpath/lstat ancestry checks, receipts, adversarial evidence, and final independent approval are mandatory. | PASS | — |

### Layer 2 findings

| Section | Mechanical feasibility | Gaps found | Conflicts found | Highest-risk edit and mitigation |
|---|---|---|---|---|
| Stage 0 | Task folder exists; all five preparatory artifacts are permitted under `process/`. | Final verification/review cannot exist before implementation. | None after adding Report and authority proof destinations. | False early approval; keep review `REJECT` and require final pack PASS. |
| Stage 1 | Validator entry point, exact legacy fields, duplicate scanner, summary, and stdlib imports are present and uniquely identifiable. | Temporary dispatch, decoded-key scanner, path grammar, and read-only seam must be added. | Existing six-field logic cannot receive temporary fields. | Legacy drift; capture byte oracles first and isolate dispatch before new checks. |
| Stage 2 | Existing fixture directory contains exactly 10 Markdown fixtures; all 17 new names are absent at VALIDATE. | Grouped lexical variants require self-checks in addition to fixtures. | None. | False acceptance; red-first each negative class, then run all 27 fixtures. |
| Stage 3 | All canonical protocol and Claude/Codex mirror files exist. | Current text is legacy-only by design. | Generic three-preflight Report behavior conflicts with temporary per-target checks unless dispatch-specific wording is added. | Prompt drift; edit canonical protocols first, mirror agents, then run parity/wiring validators. |
| Stage 4 | `all-tests.md`, risk validators, type lane, Vitest, ESLint, and whitespace gates exist. | Live junction probe may be privilege-blocked; frontmatter validator is absent. | Neither gap may be reported green. | False DONE; record junction `SKIP` as known gap and frontmatter module-not-found as not passed; final risk review must APPROVE. |

### Blast Radius Areas

- Authority validator
- Fixture and self-check matrix
- Audit skill and canonical protocols
- Claude/Codex agent parity
- Durable test context
- High-risk evidence pack
- Legacy phase Report

| Tier | Area | Scenario | Command / Steps | What it proves | What it does NOT prove |
|---|---|---|---|---|---|
| Fully-Automated | Authority validator | Parser and branch implementation is syntactically valid. | `node --check .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs` | Node parses the edited validator. | Runtime behavior or security properties. |
| Fully-Automated | Authority validator | Legacy direct PASS output remains byte-for-byte identical and temporary PASS output has the frozen shape. | Capture pre-edit stdout/stderr/exit bytes for both legacy pass fixtures; after edits rerun direct validation for both plus `pass-temporary-artifact-set.md`; compare legacy bytes exactly and parse/assert the temporary ordered fields. | Legacy compatibility and new summary contract. | Windows reparse behavior during creation. |
| Fully-Automated | Fixture and self-check matrix | All positive and adversarial envelope cases classify correctly. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope` | Exactly 27 fixtures classify correctly and grouped self-check variants pass. | Live filesystem races outside injected observations. |
| Fully-Automated | Audit skill and canonical protocols | Canonical harness wiring remains internally consistent. | Run separately: `node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.test.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-seeds.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs`. | Skill/protocol/catalog/scaffold/portability wiring. | Agent mirror byte parity, covered separately. |
| Fully-Automated | Claude/Codex agent parity | VALIDATE and EXECUTE mirrors remain equivalent. | `node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs` | Claude/Codex prompt parity. | Behavioral execution by an agent. |
| Fully-Automated | Durable test context | Bounded project regressions remain green. | Run separately: `npx eslint .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; `npm run typecheck:core`; `npm test`. | Touched validator lint plus bounded type and full app regression. | Junction privilege or all Windows reparse tags. |
| Fully-Automated | High-risk evidence pack | Final evidence has the required structure and explicit approval. | Run separately: `node .claude/skills/vc-risk-evidence-pack/scripts/validate-evidence-pack.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26`; `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness`; then assert `review-decision.json.decision === "APPROVE"`, all adversarial scenarios have `ruled_out === true`, and verification result is `PASS`. | Required artifact structure and recorded review. | Truth of evidence without fresh reviewer inspection. |
| Fully-Automated | Legacy phase Report | Final repository scope and whitespace are bounded. | `git diff --check -- .claude/skills/vc-audit-vc process/development-protocols/vc-system-behavior/08-validate.md process/development-protocols/vc-system-behavior/09-execute.md .claude/agents/vc-validate-agent.md .claude/agents/vc-execute-agent.md .codex/agents/vc-validate-agent.toml .codex/agents/vc-execute-agent.toml process/context/tests/all-tests.md process/general-plans/active/execution-authority-temp-artifact-set_26-08-26` plus an exact changed-path allowlist comparison against `### Exact authorized files`. | No whitespace defects and no unauthorized changed path from this execution. | Pre-existing unrelated working-tree changes; they must remain untouched. |
| Hybrid | Authority validator | Production checks reject a controlled alias and preserve exclusive-create/readback evidence. | Run injected-seam reparse rejection deterministically; on Windows attempt a disposable child junction probe under `C:\Users\Admin\AppData\Local\Temp\opencode` when privilege permits; run absent-target create/readback/collision probe on non-A4.6 names; clean only executor-owned probe paths. | Production check composition, collision refusal, and live junction rejection when available. | Every Windows reparse tag; skipped junction creation is a known gap. |
| Agent-Probe | High-risk evidence pack | Fresh reviewer verifies trust-boundary completeness and scope. | Inspect final five JSON artifacts, exact gate outputs, diff allowlist, legacy byte oracle, junction status, and receipt evidence; then write APPROVE or REJECT with rationale. | Independent security and completion decision. | Future OS/runtime behavior after review. |
| Known-Gap | Authority validator | Universal Windows reparse-tag detection. | — | — | Node `lstat().isSymbolicLink()` plus realpath does not prove every Windows reparse tag; add a separately approved native helper only if universal tag assurance becomes required. |
| Known-Gap | Audit skill and canonical protocols | Agent frontmatter validator. | — | — | `.claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs` is absent; run it, record module-not-found, and do not count it green. |

Failing stub:
```js
test("should preserve both legacy PASS outputs byte-for-byte and emit the frozen temporary PASS summary", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: preserve both legacy PASS outputs byte-for-byte and emit the frozen temporary PASS summary")
})
```

Failing stub:
```js
test("should reject every temporary authority negative fixture and injected reparse observation", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reject every temporary authority negative fixture and injected reparse observation")
})
```

### Gap Resolution Options

| Gap | Resolution options |
|---|---|
| Universal Windows reparse-tag proof is outside Node's portable observations. | A) Add deterministic seam tests now. B) Attempt the bounded Windows junction probe with current OS privileges. C) Accept only the explicit all-tag known gap while mandatory production checks remain green. D) Create a separate native-helper plan if universal tag assurance becomes required. |
| Agent frontmatter validator is absent. | A) Run the prescribed command and record module-not-found accurately. B) No infrastructure setup can supply an absent in-scope script. C) Accept as an existing named audit gap without counting it green. D) Create a separate harness plan to implement the validator. |

### Missing Test Areas

| Area | Why untestable in this plan | Resolution chosen |
|---|---|---|
| Universal Windows reparse-tag detection | Requires a Windows-native tag API/helper outside the approved stdlib-only scope. | Known gap with separate-plan upgrade path. |
| Agent frontmatter validation | Prescribed validator script does not exist and creation is outside touchpoints. | Existing known gap; command remains explicitly non-green. |

### Exact authorized files

EXECUTE may modify or create only these exact repository paths:

- `.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`
- `.claude/skills/vc-audit-vc/SKILL.md`
- `process/development-protocols/vc-system-behavior/08-validate.md`
- `process/development-protocols/vc-system-behavior/09-execute.md`
- `.claude/agents/vc-validate-agent.md`
- `.codex/agents/vc-validate-agent.toml`
- `.claude/agents/vc-execute-agent.md`
- `.codex/agents/vc-execute-agent.toml`
- `process/context/tests/all-tests.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-temporary-artifact-set.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-root.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-traversal.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-target.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-glob.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-too-many.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-missing-receipt-schema.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-mixed-lane.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-key.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-escaped-duplicate-key.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-scope-count.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-stop-count.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-prefix-collision.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-device-namespace.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-trailing-dot-space.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-ads.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-dos-device.md`
- `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-reparse-seam.md`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/index.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/pre-edit-baseline.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-baseline-manifest.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-after-manifest.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair.patch`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-before.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-after.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/fixture-suite.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/validator-syntax.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/temporary-pass.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/creation-probe.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/junction-probe.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/eslint.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/typecheck-core.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/npm-test.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/tier1-audits.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/frontmatter-known-gap.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/risk-gates.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/diff-gates.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/independent-evl.json`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`
- `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md`

The Autopilot proof file is read-only during EXECUTE. No application source, A4.6 plan, historical Phase 02 plan, A4.6 candidate/artifact, package/lockfile, dependency, Git metadata, deployment configuration, generated build output, network target, secret, or external service is authorized.

### Execute-agent instructions

1. Run the legacy envelope preflight before the first EXECUTE side effect. This plan uses the legacy `phase-report/v1` lane because EXECUTE modifies repository harness files; the temporary lane being implemented is not this plan's execution lane.
2. Before edits, capture byte-exact stdout, stderr, and exit status for direct validation of `pass-envelope.md` and `pass-correction-envelope.md`; prove the 17 destination fixture names are absent.
3. Implement Stage 1 and Stage 2 red-first. Do not touch protocols/prompts until validator and all 27 fixtures pass and both legacy byte oracles match.
4. Use only Node standard library. The injectable filesystem seam is read-only and narrow; no generic write interceptor or exported writer is allowed.
5. Run every fully automated and hybrid gate exactly as written. Record a privilege-blocked live junction probe as `SKIP`, not PASS.
6. Complete all five risk artifacts from real evidence. Finalize only when both risk validators pass, all adversarial scenarios are ruled out, verification result is PASS, and a fresh reviewer writes `APPROVE`.
7. Run the envelope preflight again before Report writes and final summary. Stop on any envelope, scope, legacy-byte, fixture, security, or risk-pack failure.

### Test gates

- Fully-Automated: all exact commands and byte-comparison steps in the test matrix above.
- Hybrid: injected-seam rejection, disposable Windows junction attempt when permitted, and non-A4.6 exclusive-create/readback/collision probe.
- Agent-Probe: fresh risk-pack and exact-diff review.
- Known-Gap: universal Windows reparse tags and absent frontmatter validator; neither may be called PASS.

### Open gaps

- Universal Windows reparse-tag detection remains outside the stdlib-only ceiling; production realpath/lstat/ancestor checks and deterministic seam coverage remain mandatory.
- Live junction creation may be privilege/policy blocked. If blocked, record `SKIP` and preserve the known gap.
- The prescribed agent frontmatter validator is absent and must be reported module-not-found, not green.

### What This Coverage Does NOT Prove

VALIDATE did not run implementation gates and does not approve nonexistent code. Fixture and seam tests do not prove every Windows reparse tag or eliminate all TOCTOU risk. A successful disposable junction probe proves only the exercised Windows configuration. Full `npm test` proves application regression, not filesystem authority. Structural risk validators prove artifact shape, not evidence truth; fresh independent review remains mandatory.

### Accepted by

session (autonomous, full Autopilot) — PASS authorizes only bounded EXECUTE under this contract; final implementation approval remains withheld pending the complete risk pack and fresh EVL/review.

### Execution Authority & Evidence Envelope

```json historical-invalid-execution-authority-envelope/v1
{
  "selected_plan": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_AUTOPILOT_GOAL_26-08-26.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
    ".claude/skills/vc-audit-vc/SKILL.md",
    "process/development-protocols/vc-system-behavior/08-validate.md",
    "process/development-protocols/vc-system-behavior/09-execute.md",
    ".claude/agents/vc-validate-agent.md",
    ".codex/agents/vc-validate-agent.toml",
    ".claude/agents/vc-execute-agent.md",
    ".codex/agents/vc-execute-agent.toml",
    "process/context/tests/all-tests.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-temporary-artifact-set.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-root.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-traversal.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-target.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-glob.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-too-many.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-missing-receipt-schema.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-mixed-lane.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-key.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-escaped-duplicate-key.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-scope-count.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-stop-count.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-prefix-collision.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-device-namespace.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-trailing-dot-space.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-ads.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-reparse-seam.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md"
  ],
  "stop_conditions": [
    "Any absent-authorityClass legacy stdout, stderr, error text, validation order, PASS bytes, or exit status drifts.",
    "Any required fixture or self-check misclassifies, any temporary summary/receipt field or order drifts, or any exact authorized path requires reinterpretation.",
    "Any filesystem target is outside the exact allowed_scope, or any application source, A4.6 plan, historical Phase 02 plan, A4.6 candidate, A4.6 temporary artifact, package, lockfile, dependency, build output, or deployment file would be touched.",
    "Any reparse, realpath, ancestor, containment, destination identity, exclusive-create, readback, receipt, or collision check fails or cannot be represented by the approved stdlib seam and explicit ceiling.",
    "Any final risk artifact is missing, structurally invalid, factually incomplete, not fully ruled out, or review-decision.json is not APPROVE.",
    "Any Git staging, commit, push, PR, deploy, network, provider, secret, external-service, destructive, irreversible, or cost-generating action is requested.",
    "Any pre-existing unrelated working-tree file is modified, deleted, restored, staged, or used to broaden this execution.",
    "Any implementation requires a new dependency, package script, native binary, generic filesystem write interceptor, or file outside the exact authorized list."
  ],
  "artifact_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md",
  "artifact_schema_version": "phase-report/v1"
}
```

### Historical Handoff — Invalidated

The prior EXECUTE handoff and envelope above are non-executable historical text. They do not authorize repair work and must not be consumed by EXECUTE.

## Invalidated Prior Validate Contract — 2026-08-26 Fresh Validation, Historical and Non-Executable

Status: REJECT
Date: 2026-08-26
date: 2026-08-26
generated-by: outer-pvl
supersedes: 2026-08-26 (outer-pvl) — fresh independent deep validation of the amended repair plan

Parallel strategy: workflow
Rationale: 4/7 signals (`S2`, `S5`, `S6`, `S7`); use one deterministic, sequentially gated opus EXECUTE leg because the validator, mirrors, evidence, and Report share ordering/state, followed by a fresh independent sonnet EVL. Parallel subagents are unsuitable for overlapping writes. Cost guard is not triggered.

### Layer 1 dimensions

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

### Layer 2 sections

| Layer 2 sections | Status |
|---|---|
| Stage 0 — VALIDATE high-risk contract and evidence setup | PASS |
| Stage 1 — Validator isolated dispatch and parser integrity | PASS |
| Stage 2 — Fixtures and focused behavior proof | PASS |
| Stage 3 — Audit skill, protocols, and prompt parity | PASS |
| Stage 4 — Test context and final evidence | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 9 PASSes**

**Net Gate: PASS**

### Fresh validation findings and resolved plan gaps

1. All eight repair decisions are executable and mandatory: DOS-device aliases; lexical approved-root chain inspection before realpath; complete postreadback root/ancestry/containment/destination revalidation; legacy-three versus temporary-one full-envelope invocation counts; temporary-only decoded duplicate-key hardening; display-path wording separated from filesystem identity; native raw-byte receipts; and current-state baseline/status repair.
2. Fixture scope is frozen at 28 Markdown files: the original 10 remain byte-preserved, the current 17 temporary fixtures remain repair-baseline inputs, and only `fail-temp-dos-device.md` is created. Expected composition is 3 pass and 25 negative.
3. Repair implementation/evidence scope is exactly 53 files. The legacy `phase-report/v1` envelope has 54 exact `allowed_scope` entries because the validator also requires the selected plan itself to be covered for VALIDATE/status bookkeeping. The plan is excluded from the 53 repair count and from `repair.patch`.
4. Evidence inventory is exactly 20 paths. `index.json.receipts` contains 14 receipt/aggregate paths, not 13. All JSON key orders, receipt semantics, patch format, retention checks, and secret-scan stop behavior are frozen in `Raw gate evidence subtree`.
5. Legacy compatibility is behavioral, not historical-diff based: capture all original 10 fixtures before repair and after repair with native Node child-process Buffers, compare stdout bytes, stderr bytes, and integer exit status exactly per sorted fixture, and inspect current canonical legacy validation/error ordering. `PRE_EDIT_BASELINE_UNAVAILABLE` remains explicit.
6. `repair.patch` is a custom byte-preserving current-baseline-to-repair delta over changed implementation/documentation/risk/Report paths only. It excludes the selected plan, evidence files, Autopilot proof, and every unrelated application/worktree path.
7. Ignored evidence remains readable through exact-path filesystem retention, regular/non-symlink checks, reopen/hash verification, and final index replay. It is never staged, force-added, committed, copied outside the task folder, or used to change `.gitignore`.
8. Risk state is correctly rolled back: plan, Report, `risk-gate.json`, `context-snippets.json`, `verification.json`, `review-decision.json`, and `adversarial-validation.json` remain `REPAIR REQUIRED`/`REJECT` until repair gates and a fresh independent EVL finish. Historical PASS text is non-authoritative.
9. No database/application schema, migration, app source, app test, package/lockfile, dependency, build/deploy configuration, Git state, A4.6 plan/artifact/candidate, or historical Phase 02 artifact is changed.

### Exact test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-02/03/07 | Validator parses after repair. | Fully-Automated | Native receipt for `node --check .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; exit 0. | B |
| AC-01/02/03/04/07/11 | Exact 28-fixture composition and grouped security self-checks classify correctly. | Fully-Automated | Native receipt for `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope`; require `28 fixture(s) (3 pass-case, 25 negative-case)` and zero `MISS`. | B |
| AC-01/07/09 | All original legacy behavior is byte-identical across repair. | Fully-Automated | A Node stdlib runner enumerates the original 10 fixture names in ordinal order, uses `spawnSync(process.execPath,[validator,fixture],{cwd,encoding:null,windowsHide:true,maxBuffer:67108864})`, records Buffers as base64 plus integer status in `legacy-before.json` and `legacy-after.json`, then compares decoded stdout/stderr and status exactly for every fixture. | B |
| AC-02/03/04/06 | Temporary positive emits the exact nine-key ordered summary. | Fully-Automated | Direct native child-process receipt against `pass-temporary-artifact-set.md`; parse only after raw capture and require ordered `status,authorityClass,selected_plan,mode,proof_path,scope_count,stop_condition_count,artifact_receipt_schema_version,artifact_paths`. | B |
| AC-05/06/09 | Exclusive create, collision refusal, readback, schema, SHA-256, and postreadback identity checks work. | Hybrid | Native receipt for `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --creation-probe`; use only executor-owned non-A4.6 names and require cleanup. | B |
| AC-04/05/09 | Node-observable root/ancestor/destination aliasing rejects. | Hybrid | Native receipt for `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --junction-probe`; PASS when exercised and rejected, SKIP only for privilege/policy inability, never reinterpret SKIP as PASS. Deterministic seam checks remain mandatory. | B |
| AC-10 | Touched validator lint is clean. | Fully-Automated | Native receipt for `npx eslint .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; exit 0. | B |
| AC-10 | Bounded core type lane remains green. | Fully-Automated | Native receipt for `npm run typecheck:core`; exit 0. | B |
| AC-10 | Full application regression remains green without app edits. | Fully-Automated | Native receipt for `npm test`; exit 0. | B |
| AC-08/10 | Tier-1 harness wiring remains valid. | Fully-Automated | Run and capture separately: `validate-agent-parity.mjs`, `validate-skills.mjs`, `validate-guide-sync.mjs`, `validate-guide-sync.test.mjs`, `validate-protocol-wiring.mjs`, `validate-seeds.mjs`, `validate-kit-portability.mjs`, and `validate-skill-invocation-wiring.mjs`; aggregate in `tier1-audits.json`. | B |
| AC-08 | Known absent frontmatter validator is reported truthfully. | Agent-Probe | Native receipt for `node .claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs`; require expected non-zero/module-not-found and status `SKIP`, never PASS. | D |
| AC-09 | Five-file high-risk pack is structurally complete and remains rejected until EVL. | Fully-Automated | Capture separately: `node .claude/skills/vc-risk-evidence-pack/scripts/validate-evidence-pack.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26` and `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness`; aggregate in `risk-gates.json`. Final APPROVE is forbidden during repair EXECUTE. | B |
| AC-08/09/10 | Exact current-state repair scope, patch reconstruction, evidence inventory, retention, and whitespace are bounded. | Fully-Automated | Node allowlist gate compares repair baseline/after manifests, reconstructs every `repair.patch` entry, requires exactly 20 evidence paths and 54 envelope paths, rejects app/A4.6/dependency/Git/deploy paths, then run the scoped `git diff --check -- ...` command in Verification Evidence. Capture in `diff-gates.json`. | B |
| AC-09 | Fresh independent EVL reviews raw receipts and security claims. | Agent-Probe | A fresh independent reviewer reopens all 20 evidence paths, decodes/re-hashes raw streams, verifies current-state scope and all eight repairs, reruns mandatory gates, writes `independent-evl.json`, then and only then changes `review-decision.json` to APPROVE or leaves REJECT. | B |

Failing stub:
```js
test("should preserve all original legacy fixture stdout, stderr, and exit bytes across repair", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: preserve all original legacy fixture stdout, stderr, and exit bytes across repair")
})
```

Failing stub:
```js
test("should reject DOS devices and root, ancestry, destination, and postreadback identity drift", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reject DOS devices and root, ancestry, destination, and postreadback identity drift")
})
```

Legacy line form:
- Authority validator and fixtures: Fully-automated syntax, 28-fixture, all-10 legacy-byte, and temporary-positive gates | hybrid creation/junction probes | agent-probe independent EVL | known-gap universal Windows reparse-tag coverage.
- Harness parity and regressions: Fully-automated lint, Tier-1, typecheck, full Vitest, risk-structure, scope/patch/evidence/whitespace gates | agent-probe current-state/security review | known-gap absent frontmatter validator.

Dimension findings:
- Infra fit: PASS — Node 24 stdlib and exact existing harness paths support the repair; evidence directories/files are create-only as listed, with no runtime/container/deploy surface.
- Test coverage: PASS — every developed repair surface has named automated or hybrid behavior proof; the two explicit ceilings are non-vacuous residuals.
- Breaking changes: PASS — the harness public-contract change is already scoped; absent-`authorityClass` compatibility is frozen behaviorally, mirrors are explicit, and no application/database schema changes occur.
- Security surface: PASS — high-risk permission/trust-boundary work is fail-closed, raw evidence is secret-scanned before persistence, and final approval is withheld for independent EVL.
- Stage 0 feasibility: PASS — exact risk/status reset, native capture, manifests, patch, and evidence files are mechanically specified.
- Stage 1 feasibility: PASS — current validator contains each repair anchor; branch isolation and the narrow read-only observation seam require no dependency.
- Stage 2 feasibility: PASS — 27 fixtures exist now, `fail-temp-dos-device.md` is absent/create-only, and exact 28 total is achievable without splitting grouped cases.
- Stage 3 feasibility: PASS — all six canonical protocol/agent mirror paths exist and parity gates are exact.
- Stage 4 feasibility: PASS — exact 20-file evidence inventory, 14 receipt list, risk validators, regression commands, current-state review, and independent EVL are executable.

Open gaps:
- Universal Windows reparse-tag proof remains outside Node stdlib; do not claim all-tag safety.
- Residual TOCTOU risk is reduced by immediate precreate and complete postreadback checks but not eliminated.
- Live junction creation may return SKIP under Windows privilege/policy; deterministic injected rejection must still pass.
- `validate-agent-frontmatter.mjs` is absent and remains explicitly non-green.

What This Coverage Does NOT Prove:
- VALIDATE ran structural/read-only checks only; it does not claim the repair implementation or EXECUTE gates are green.
- Fixture/seam and one live junction case do not prove every Windows reparse tag or remove all races.
- Full Vitest does not prove filesystem authority; risk validators prove JSON structure, not evidence truth.
- Current-state behavioral comparison cannot recreate a missing true pre-edit implementation baseline.
- Ignored-file filesystem retention does not make evidence portable across clone or cleanup; no Git retention is authorized.

Gate: PASS — all plan gaps found in this validation are resolved directly; no FAIL or CONCERN remains.
Accepted by: session — user explicitly requested fresh independent VALIDATE and plan-gap resolution; final implementation APPROVE remains reserved for independent EVL.

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_AUTOPILOT_GOAL_26-08-26.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
    ".claude/skills/vc-audit-vc/SKILL.md",
    "process/development-protocols/vc-system-behavior/08-validate.md",
    "process/development-protocols/vc-system-behavior/09-execute.md",
    ".claude/agents/vc-validate-agent.md",
    ".codex/agents/vc-validate-agent.toml",
    ".claude/agents/vc-execute-agent.md",
    ".codex/agents/vc-execute-agent.toml",
    "process/context/tests/all-tests.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-temporary-artifact-set.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-root.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-traversal.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-target.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-glob.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-too-many.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-missing-receipt-schema.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-mixed-lane.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-duplicate-key.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-escaped-duplicate-key.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-scope-count.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-wrong-stop-count.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-prefix-collision.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-device-namespace.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-trailing-dot-space.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-ads.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-dos-device.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-temp-reparse-seam.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/index.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/pre-edit-baseline.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-baseline-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-after-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair.patch",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-before.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-after.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/fixture-suite.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/validator-syntax.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/temporary-pass.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/creation-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/junction-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/eslint.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/typecheck-core.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/npm-test.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/tier1-audits.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/frontmatter-known-gap.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/risk-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/diff-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/independent-evl.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md"
  ],
  "stop_conditions": [
    "Any absent-authorityClass legacy stdout bytes, stderr bytes, numeric exit status, error text, validation order, or PASS shape drifts for any original fixture.",
    "Any fixture count differs from exactly 28 with 3 pass and 25 negative, any fixture/self-check misclassifies, or any receipt/PASS/evidence schema or key order drifts.",
    "Any repair touches A4.6, candidate or temporary A4.6 artifacts, application source/tests, package or lock files, dependencies, database/application schemas, build/deploy configuration, Git state, or any path outside allowed_scope.",
    "Any filesystem root, ancestor, destination, realpath, lstat, containment, reparse, exclusive-create, readback, schema, SHA-256, receipt, collision, or cleanup check fails or requires weaker semantics.",
    "Any raw command stream is transformed through PowerShell or text decoding before base64 capture, cannot be retained/read back byte-exactly, or matches the fail-closed secret scan.",
    "Any repair.patch entry includes the selected plan, evidence files, Autopilot proof, unrelated application/worktree content, a deletion, or cannot reconstruct exact before/after bytes and hashes.",
    "Any risk/status artifact claims PASS, COMPLETE, VERIFIED, or APPROVE before a fresh independent EVL reviews all raw receipts and writes the final decision.",
    "Any Git staging, commit, push, PR, deploy, network/provider/secret/external-service mutation, irreversible, destructive, or cost-generating action is requested."
  ],
  "artifact_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md",
  "artifact_schema_version": "phase-report/v1"
}
```

### Repair EXECUTE handoff

1. Validate this envelope before the first side effect, before the mid-repair Report update, and before completion/exit. This repair uses the legacy `phase-report/v1` lane; it does not use the temporary branch it repairs.
2. Confirm plan receipt at EXECUTE entry against the final receipt below. Freeze current implementation/documentation/risk/Report bytes and all original 10 fixture native outputs before edits.
3. Keep all five risk files and the Report in `REPAIR REQUIRED`/`REJECT` state through repair EXECUTE. Do not write final APPROVE; EVL owns it.
4. Execute Stages 1–4 in order. Stop rather than widen scope. Do not touch A4.6, app worktree, dependencies, Git, deploy, schemas, candidates, or temporary A4.6 artifacts.
5. Emit exactly the 20 evidence files, replay/reopen every path, and hand the complete pack to a fresh independent EVL. Final approval and any A4.6 work remain blocked until that EVL returns APPROVE.

**Historical validated plan receipt:** superseded by this PLAN amendment; fresh VALIDATE must compute a new closed V6 receipt with native `fs.readFileSync` bytes before any EXECUTE handoff.

This historical contract and its execution envelope are non-executable. Do not emit or consume an execution envelope during PLAN.

## Invalidated Prior Validate Contract — 2026-08-27, Historical and Non-Executable

This former PASS contract is invalidated by two fresh independent EVL rejections: unconditional temporary-lane midpoint full-envelope reruns remain in both EXECUTE mirrors, and probe cleanup remains recursive or identity-blind. No envelope below this heading is executable.

Status: REJECT
Date: 2026-08-27
date: 2026-08-27
generated-by: outer-pvl
supersedes: 2026-08-26 (outer-pvl — invalidated amended-recovery assessment)

### Net Gate

#### Layer 1 dimensions

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

#### Layer 2 sections

| Layer 2 sections | Status |
|---|---|
| Residual code repair — frozen precreate root identity | PASS |
| Residual prompt repair — legacy-only completion rerun | PASS |
| Current-state evidence replacement | PASS |
| Independent EVL and high-risk decision | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 8 PASSes**

**Net Gate: PASS**

### Findings and Plan Fixes

1. The failed historical `harness/evidence/repair.patch` is immutable at exactly `160` bytes / SHA-256 `33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`. It is not writable authority, is never a success gate, remains indexed as `UNAVAILABLE_ACCEPTED_BY_AMENDMENT`, and is excluded from every PASS conjunction.
2. `PRE_EDIT_BASELINE_UNAVAILABLE` and `REPAIR_BASELINE_BYTES_UNRECOVERABLE` are permanent residual provenance gaps. Current-state evidence may approve current bytes but must not claim reconstructed historical bytes, patch provenance, or byte-preserving repair reconstruction.
3. Residual implementation scope is smaller than the historical 53-file repair scope: exactly three implementation/prompt paths, five risk paths, nineteen writable evidence paths, the selected plan, and the canonical Report. The twentieth evidence file is immutable and read-only. No new fixture, evidence, report, risk, dependency, source, or support path is authorized.
4. Public temporary-envelope schema, security grammar, path rules, receipt/PASS ordering, A4.6 reference, legacy Report/Correction behavior, and compatibility requirements remain unchanged.
5. ESLint uses the truthful non-vacuous native Node CLI command `node node_modules/eslint/bin/eslint.js --no-ignore .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`. `eslint.json.command` must equal that actual invocation. The historical direct `npx.cmd` `EINVAL`, shell fallback, and ignored-file warning are variance history, not this gate's PASS evidence.
6. `index.json.status` may become `PASS` with `repairPatchStatus: "UNAVAILABLE_ACCEPTED_BY_AMENDMENT"` only when the immutable patch remains indexed as non-PASS history, `repairPatchIncluded` is `false`, all eight current-state conjunction booleans are true, and fresh independent EVL is `APPROVE`.
7. Independent EVL must be performed by a fresh reviewer that did not implement the repair. EXECUTE cannot approve itself. Risk `APPROVE`, A4.6 readiness, `VERIFIED`, and completion remain forbidden until that independent review finishes.

### Exact Residual Implementation Touchpoints

#### R1 — Root identity freeze

In `.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`, edit only `createTemporaryArtifact` and its deterministic self-checks:

1. Retain `precreate.rootReal` from the immediate precreate `assertSafeTemporaryTarget` result.
2. After close and before receipt, call the complete existing `assertSafeTemporaryTarget(..., { requireFile: true })` postreadback path.
3. Compare the postreadback `rootReal` directly to frozen precreate `rootReal` using the same Windows separator normalization and case-insensitive comparison used by containment. A mismatch must call `block` before readback success or receipt emission.
4. Add one deterministic self-check whose observation seam returns one root identity during precreate and a different root identity during postreadback; require rejection. The check must exercise `createTemporaryArtifact` without granting a generic write interceptor or changing production defaults.
5. Preserve lexical approved-root-chain `lstat` before every root `realpath`, complete ancestry/containment/destination checks, exclusive `wx`, receipt key order, and all existing public output.

#### R2 — Legacy-only completion rerun

Edit only the generic completion-envelope paragraph in both prompt mirrors:

- `.claude/agents/vc-execute-agent.md` under `## Completion`, currently beginning `**Envelope preflight:**`.
- `.codex/agents/vc-execute-agent.toml` inside `developer_instructions`, under `## Completion`, currently beginning `**Envelope preflight:**`.

Each paragraph must state executable branch logic: when `authorityClass` is absent, rerun the full envelope before the schema-bound completion artifact and exit summary; when `authorityClass === "temporary-artifact-set/v1"`, do not rerun the full envelope and instead require completion of every per-target postreadback check and receipt. Preserve the existing initial and legacy mid/completion cadence, temporary one-preflight cadence, schema destinations, stops, and Claude/Codex semantic parity.

### Current-State EVL Contract

#### Frozen source-review manifest set

Rewrite `repair-baseline-manifest.json` immediately before R1/R2 edits and `repair-after-manifest.json` after R1/R2 plus permitted Report/risk status updates. Both manifests must have the same exact ordinal-sorted nine-path entry set:

1. `.claude/agents/vc-execute-agent.md`
2. `.claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`
3. `.codex/agents/vc-execute-agent.toml`
4. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md`
5. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json`
6. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json`
7. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json`
8. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json`
9. `process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json`

Each manifest keeps ordered keys `schema,baselineKind,generatedAt,entries`; each entry keeps ordered keys `path,kind,bytes,sha256,gitTrackingState`. Derive ordinal-sorted `differingPaths`, `newPaths`, and `deletedPaths` solely from complete entry-set membership and SHA-256 values. Require `newPaths: []`, `deletedPaths: []`, no unexpected path, and every differing path in the exact nine-path set. Any deletion, entry-set drift, unlisted difference, or hash/byte mismatch stops.

#### Exhaustive independent source review

Fresh independent EVL must reopen and inspect the complete current bytes of every path in `differingPaths + newPaths`; snippets or diffs alone are insufficient. `independent-evl.json.reviewedPaths` contains exactly one ordinal-sorted record per such path with current bytes, SHA-256, `PASS | FAIL`, and findings. Approval requires all records PASS and specific confirmation that:

- `createTemporaryArtifact` compares postreadback root identity directly to frozen precreate `rootReal` before receipt;
- the root-drift self-check rejects;
- both completion paragraphs are legacy-only and temporary mode has no completion full-envelope rerun;
- public schema/security/path/receipt/compatibility semantics did not change;
- Report/risk claims remain truthful.

This review proves current-state acceptability only. It cannot prove unavailable historical before bytes.

#### Original 10 legacy byte contract

Before R1/R2 edits, refresh `legacy-before.json`; after edits, refresh `legacy-after.json`. Enumerate the original ten non-temporary fixtures in ordinal filename order and invoke each separately with `spawnSync(process.execPath, [validator, fixture], { cwd, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })`. Require exactly ten records and exact per-fixture equality of decoded stdout Buffer, stderr Buffer, and integer exit status. Timestamps and receipt wrapper hashes may differ. Review current canonical legacy validation/error ordering. Do not use PowerShell, decoded strings, JSON reserialization, or only the two pass fixtures as the oracle.

#### Permanent gaps and forbidden claims

Every final decision surface must retain:

- `PRE_EDIT_BASELINE_UNAVAILABLE`;
- `REPAIR_BASELINE_BYTES_UNRECOVERABLE`;
- universal Windows reparse-tag coverage is unproven;
- residual TOCTOU is not eliminated;
- `.claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs` is absent and non-green.

Forbidden claims: historical patch PASS; reconstructed before bytes; universal reparse safety; race elimination; frontmatter PASS; shell fallback represented as exact direct `npx`; independent approval by the executor; A4.6 readiness before EVL/risk approval; any application, candidate, dependency, Git, deploy, network, provider, or external-service work.

### Test Gates

| Tier | Area | Scenario | Exact command / procedure | What it proves | What it does not prove |
|---|---|---|---|---|---|
| Fully-Automated | Plan/envelope | Plan structure and final legacy envelope are executable. | Run separately: `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`; `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`. | Structural plan validity and exact execution authority. | Implementation correctness. |
| Fully-Automated | Root identity | Validator parses and root-drift self-check rejects before receipt. | Run separately: `node --check .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope`. Require exactly 28 fixtures, 3 pass, 25 negative, no `MISS`, and the named root-drift self-check. | Syntax, complete fixture classification, and deterministic frozen-root comparison. | Every native Windows reparse tag or elimination of races. |
| Fully-Automated | Legacy compatibility | All ten original legacy fixture streams/exits remain byte-identical. | Native Buffer capture and per-record comparison procedure under `Original 10 legacy byte contract`. | Legacy observable compatibility across every original fixture. | Missing historical pre-edit implementation bytes. |
| Fully-Automated | Temporary summary | Temporary direct validation preserves exact output. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-temporary-artifact-set.md`; capture native raw streams and require ordered nine-key summary. | Temporary public PASS shape and accepted path display. | Creation safety. |
| Hybrid | Creation security | Exclusive creation/readback and frozen-root identity checks precede receipt. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --creation-probe`; use only executor-owned non-A4.6 names and require collision refusal and cleanup. | Exercised create/readback/receipt path. | Universal race freedom. |
| Hybrid | Windows alias security | Live disposable junction rejects when policy permits. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --junction-probe`; PASS only when exercised/rejected, otherwise `SKIP`, never PASS. | One native Node-observable Windows junction case. | All reparse tags. |
| Fully-Automated | ESLint | Validator is actually linted despite ignored harness paths. | `node node_modules/eslint/bin/eslint.js --no-ignore .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; native Buffer capture, exit 0, and no ignored-file warning. | Touched validator lint. | Runtime behavior. |
| Fully-Automated | Prompt parity/wiring | Claude/Codex prompts and canonical protocol wiring remain aligned. | Run separately and aggregate: `node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.test.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-seeds.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs`. | Harness parity and wiring. | Agent behavior at runtime. |
| Known-Gap | Frontmatter | Missing validator remains explicit. | `node .claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs`; require expected non-zero `MODULE_NOT_FOUND` and receipt status `SKIP`. | Truthful absence recording. | Frontmatter correctness. |
| Fully-Automated | Regression | Bounded type lane and full application tests remain green. | Run separately: `npm run typecheck:core`; `npm test`. | No detected bounded type/full-suite regression. | Filesystem authority by itself. |
| Fully-Automated | Risk structures | Five-file risk pack has valid structure before and after EVL decision. | Run separately: `node .claude/skills/vc-risk-evidence-pack/scripts/validate-evidence-pack.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26`; `node .claude/skills/vc-risk-evidence-pack/scripts/validate-risk-artifacts.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness`. | Required risk artifact structure. | Evidence truth or reviewer independence. |
| Fully-Automated | Current-state integrity | Exact nine-path manifests, immutable patch, evidence inventory, retention, and whitespace/EOF are valid. | Native Node gate: compare manifest entry sets/hashes; assert exact changed/new/deleted sets and allowlist; assert exactly 20 evidence filenames; assert `repair.patch` exact `160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`; reopen/hash every evidence path; run `git diff --check -- .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs .claude/agents/vc-execute-agent.md .codex/agents/vc-execute-agent.toml process/general-plans/active/execution-authority-temp-artifact-set_26-08-26`; assert final plan ends with one LF after `## EOF`. | Bounded current-state integrity and formatting. | Historical patch provenance. |
| Agent-Probe | Independent EVL | Fresh reviewer exhaustively reviews every differing/new current path and all raw gates. | Fresh independent reviewer reopens all 20 evidence files and all complete differing/new source bytes, reruns mandatory gates, validates receipt hashes/streams and forbidden claims, then writes the exact EVL/risk decisions. | Independent current-state and risk decision. | Missing historical bytes or future OS behavior. |

Failing stub:
```js
test("should reject when postreadback approved-root identity differs from frozen precreate rootReal", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reject when postreadback approved-root identity differs from frozen precreate rootReal")
})
```

Failing stub:
```js
test("should apply completion full-envelope reruns only to the absent-authorityClass legacy lane", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: apply completion full-envelope reruns only to the absent-authorityClass legacy lane")
})
```

### Evidence Refresh and Decision Sequence

1. Preflight this envelope and verify the selected-plan receipt supplied in the EXECUTE handoff.
2. Verify immutable patch identity before any write. Capture the exact nine-path repair baseline manifest and all-ten `legacy-before.json` native receipts.
3. Keep plan, Report, verification, adversarial, index, independent EVL, and risk decision at `REPAIR REQUIRED`/`FAIL`/`REJECT` while R1/R2 execute.
4. Implement only R1 and R2. Do not rewrite existing fixtures or any other implementation/protocol/context path.
5. Refresh the exact nineteen writable evidence files using native unmodified Buffer capture and fail-closed secret scanning. Do not rewrite `repair.patch`.
6. Build the exact nine-path after manifest and derive changed/new/deleted sets from complete entry membership/hashes. Require no new/deleted/unexpected path.
7. EXECUTE may report code complete but must leave final risk decision `REJECT` and plan active/testing. It hands current bytes and all evidence to a fresh independent EVL.
8. Independent EVL reruns every mandatory gate, performs exhaustive source review, and writes `independent-evl.json` with exactly ordered keys `schema,status,decision,baselineStatus,repairBaselineStatus,repairPatchStatus,manifestComparison,reviewedPaths,gateResults,residualGaps,reason,reviewer,timestamp` and the nested structures specified in `Raw gate evidence subtree`.
9. Only fresh independent EVL may set `decision: "APPROVE"`, `review-decision.json.decision: "APPROVE"`, the first eight `index.json.integrityConjunction` booleans true, `repairPatchIncluded: false`, and final `index.json.status: "PASS"`. It then refreshes verification/adversarial/Report/plan status without removing permanent gaps.
10. A4.6 remains blocked. A separate fresh A4.6 V1–V7 may begin only after this plan is `VERIFIED`, independent EVL and risk decision are `APPROVE`, and all current-state gates pass.

### Exact Risk State

Risk class remains HIGH: `permission, secret, or trust-boundary logic` plus `public API or external contract changes`. `mustStopBeforeFinalize` remains `true`. At EXECUTE entry and through executor handoff: `REPAIR REQUIRED` / `REJECT`. Final `APPROVE` is permitted only from fresh independent EVL after exhaustive current-state review and all required gates. Structural risk-validator PASS is not approval.

### Exact Writable Scope

The envelope authorizes exactly 29 writable paths: three residual implementation/prompt paths, five risk paths, nineteen evidence paths, the selected plan, and the Report. No deletion is authorized. `repair.patch` is the twentieth evidence file but is deliberately excluded from writable scope.

### Stops

Stop and return BLOCKED if any occurs:

1. `repair.patch` differs from exact `160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`, is rewritten, is represented as PASS, or enters the success conjunction.
2. Either permanent unavailable marker is omitted or any claim reconstructs historical before bytes or patch provenance.
3. Manifest entry sets differ from the exact nine paths, any new/deleted/unexpected path exists, or any differing/new path lacks exhaustive complete-byte independent review.
4. Any original legacy fixture stdout/stderr Buffer or integer exit differs across repair, or canonical legacy validation/error ordering changes.
5. Root identity is not compared directly to frozen precreate `rootReal` before receipt, the deterministic drift check does not reject, or either completion paragraph still reruns the temporary full envelope.
6. Any public schema, security grammar, path rule, receipt/PASS order, Report/Correction destination, initial/mid/completion legacy cadence, temporary one-preflight cadence, or compatibility behavior changes.
7. Any mandatory fixture, probe, parity, wiring, ESLint, typecheck, test, risk, retention, diff, whitespace, EOF, or receipt gate fails; only the named junction/frontmatter known-gap outcomes may be `SKIP`.
8. Any risk/status surface claims final PASS/COMPLETE/VERIFIED/APPROVE before fresh independent EVL, or the reviewer is not independent of implementation.
9. Any A4.6 plan/artifact/candidate, application source/test/config, package/lockfile/dependency, Git state/action, build/deploy output/config, network/provider/secret/external service, deletion, irreversible, destructive, or cost-generating action is requested.
10. Any write falls outside the exact 29 paths below.

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_AUTOPILOT_GOAL_26-08-26.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
    ".claude/agents/vc-execute-agent.md",
    ".codex/agents/vc-execute-agent.toml",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/index.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/pre-edit-baseline.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-baseline-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-after-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-before.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-after.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/fixture-suite.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/validator-syntax.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/temporary-pass.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/creation-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/junction-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/eslint.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/typecheck-core.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/npm-test.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/tier1-audits.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/frontmatter-known-gap.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/risk-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/diff-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/independent-evl.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md"
  ],
  "stop_conditions": [
    "The immutable repair.patch differs from exact 160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35, is rewritten, represented as PASS, or included in the success conjunction.",
    "Either PRE_EDIT_BASELINE_UNAVAILABLE or REPAIR_BASELINE_BYTES_UNRECOVERABLE is omitted, or historical before bytes or patch provenance are claimed reconstructed.",
    "The exact nine-path manifest entry sets drift, any new, deleted, or unexpected path exists, or exhaustive complete-byte independent review is missing for any differing or new path.",
    "Any original legacy fixture stdout bytes, stderr bytes, numeric exit, validation order, error source, PASS shape, Report or Correction behavior, or compatibility contract changes.",
    "Frozen precreate root identity is not directly compared after readback before receipt, the root-drift self-check fails, or a temporary completion full-envelope rerun remains.",
    "Any required gate fails or any status, evidence, receipt, risk, Report, or independent-review claim is inaccurate or premature.",
    "Any A4.6, candidate, application, dependency, Git, build, deploy, network, provider, secret, external-service, deletion, irreversible, destructive, or cost-generating action is requested.",
    "Any write target falls outside the exact allowed_scope or any standing hard stop is reached."
  ],
  "artifact_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md",
  "artifact_schema_version": "phase-report/v1"
}
```

### EXECUTE and EVL Handoff

- EXECUTE entry: validate the envelope before the first side effect; confirm the final plan receipt returned by VALIDATE; verify immutable patch identity; capture the nine-path baseline and all-ten legacy-before receipts.
- EXECUTE work: sequential only; implement R1 then its red/green gate, implement both R2 mirror edits, run parity, then refresh local evidence. Keep final decision `REJECT`.
- EXECUTE exit: because this is the absent-`authorityClass` legacy Report lane, rerun the envelope at the mid-Report checkpoint and before the completion Report/exit summary. Hand off all 20 evidence files and complete current bytes without approving risk.
- EVL entry: use a fresh independent reviewer with no executor conclusions as authority; reopen/rerun rather than trusting PASS labels.
- EVL approval: require exact manifest/allowlist/no-deletion review, exhaustive complete-byte review, all-ten native legacy equality, all security/parity/regression/risk gates, immutable patch status `UNAVAILABLE_ACCEPTED_BY_AMENDMENT` without PASS, permanent gaps, and explicit forbidden-claim checks.
- EVL exit: only `APPROVE` permits risk approval and A4.6-readiness classification. Otherwise retain `REJECT`, `REPAIR REQUIRED`, and active/testing state.

### Dimension Findings

- Infra fit: PASS — residual work uses existing Node 24 stdlib and exact local harness paths; no runtime/container/deploy surface is entered.
- Test coverage: PASS — both residual behaviors have named deterministic checks, plus hybrid filesystem probes and independent source/risk review.
- Breaking changes: PASS — only missing enforcement/prompt qualification is repaired; public schema and application contracts remain frozen.
- Security surface: PASS — high-risk authority remains fail-closed and cannot finalize without fresh independent APPROVE.

### Open Gaps

- `PRE_EDIT_BASELINE_UNAVAILABLE` — permanent.
- `REPAIR_BASELINE_BYTES_UNRECOVERABLE` — permanent.
- Universal Windows reparse-tag proof — outside Node stdlib.
- Residual TOCTOU — reduced, not eliminated.
- Agent frontmatter validator — absent and non-green.

### What This Coverage Does NOT Prove

This contract does not recover historical before bytes or make the immutable failed patch PASS. Deterministic seams and one junction probe do not prove all Windows reparse tags or eliminate races. Full tests do not prove filesystem authority. Structural validators do not prove evidence truth. Current-state review does not make ignored evidence portable across cleanup or clone. Independent approval remains mandatory.

### Accepted by

session — fresh independent VALIDATE requested by user; PASS authorizes only the exact residual repair and evidence/Report/risk refresh above. It does not approve implementation, risk, A4.6, Git, deploy, or external action.

## PLAN Amendment Decision — Midpoint Cadence and Fail-Closed Probe Cleanup

- **Decision 1:** both generic midpoint progress-note preflights are legacy Report/Correction only. Temporary mode retains exactly one initial full-envelope preflight, per-target precreate checks, and per-target postreadback checks; it has no midpoint or completion full-envelope rerun.
- **Decision 2:** probe/self-check cleanup uses no `rmSync` and no recursive deletion. Capture expected identity/type after creation, immediately verify before cleanup, use `unlinkSync` for the verified junction or regular non-reparse file, and use non-recursive `rmdirSync` for the verified empty source directory.
- **Decision 3:** missing/substituted/mismatched/wrong-type/non-empty cleanup targets are retained. The probe fails and reports `manual-cleanup-required` with exact retained paths.
- **Decision 4:** add exactly four deterministic cleanup self-checks, increasing 56 to 60. Fixture count remains exactly 28; no fixture file is added.
- **Decision 5:** public temporary envelope schema, path grammar, PASS/receipt ordering, selected-plan/receipt semantics, A4.6 reference, and legacy compatibility remain unchanged.
- **Decision 6:** writable authority remains exactly 29 paths; evidence remains exactly 20 files. Immutable `repair.patch` is excluded from writable scope and fixed at `160` bytes / SHA-256 `33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`.
- **Decision 7:** exact current-state review retains the same nine manifest paths and includes complete current bytes for the validator, both mirrors, Report, and five risk artifacts. It verifies midpoint wording, cleanup identity/type checks, non-recursive primitives, mismatch refusal, and truthful claim rollback.
- **Decision 8:** Report, verification, adversarial, context snippets, risk gate, review decision, index, and independent EVL remain `REPAIR REQUIRED`/`FAIL`/`REJECT` until fresh repair evidence and independent EVL. Existing local PASS/ruled-out claims for midpoint cadence and cleanup safety are superseded.

## Invalidated Prior Validate Contract — Original-Handle and Standalone-Probe Amendment, Historical and Non-Executable

Status: REJECT
Date: 2026-08-27
date: 2026-08-27
generated-by: outer-pvl
superseded-by: 2026-08-27 PLAN amendment requiring fresh VALIDATE

### Net Gate

#### Layer 1 dimensions

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

#### Layer 2 sections

| Layer 2 sections | Status |
|---|---|
| R1 — legacy-only midpoint cadence in both EXECUTE mirrors | PASS |
| R2 — identity-checked fail-closed creation cleanup | PASS |
| R3 — identity-checked fail-closed junction/source cleanup | PASS |
| R4 — evidence, risk, manifest, and independent-EVL truth repair | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 8 PASSes**

**Net Gate: PASS.** The plan is mechanically executable. This PASS authorizes only the exact repair below; it does not claim the current implementation or evidence is green.

### Findings and Plan Fixes

1. The selected plan receipt was confirmed before validation at `152054` bytes / SHA-256 `311db6ae97381ecfe215d1326a1679365c60d312276aa21730bc2e3a67dfe158`.
2. Every generic full-envelope rerun instruction in canonical `09-execute.md` and both EXECUTE mirrors was audited. Canonical protocol and each mirror's branch-cadence list, branch-dependent mode, and completion paragraph are already branch-specific. The sole remaining defects are both generic midpoint progress-note paragraphs; repair them so absent-`authorityClass` legacy Report/Correction reruns, while `temporary-artifact-set/v1` writes the progress note without a full-envelope rerun and remains under the initial preflight plus per-target checks.
3. Temporary cadence remains exactly one initial full-envelope preflight, then immediate per-target precreate and complete per-target postreadback checks. No per-target, midpoint, completion, or generic later full-envelope rerun is permitted. Legacy Report/Correction retains initial, midpoint, and completion reruns.
4. Windows behavior was directly bounded on this host: `lstatSync` identified a junction as symbolic-link/reparse-observable; `unlinkSync(junction)` removed only the junction and left its source; non-recursive `rmdirSync` rejected a non-empty source with `ENOTEMPTY`; after exact empty-directory identity/emptiness checks, `rmdirSync(source)` removed only that directory. This supports the selected primitives but does not eliminate pathname TOCTOU or prove every reparse tag.
5. Cleanup must use a narrow identity snapshot/comparison seam based on Node-observable `lstat` identity/type. A junction snapshot requires expected junction/reparse identity before `unlinkSync`. A source snapshot requires the expected regular non-reparse directory identity and zero entries before non-recursive `rmdirSync`. A creation artifact snapshot requires the expected regular non-reparse file identity before `unlinkSync`.
6. Missing, substituted, mismatched, wrong-type, reparse-observable, or non-empty cleanup paths must remain untouched. Cleanup returns probe failure with `manual-cleanup-required` and exact retained paths. No `rmSync`, recursive deletion, tree traversal, or identity-blind unlink/rmdir is permitted.
7. Add exactly four cleanup self-check targets: successful creation cleanup; refused creation cleanup after substitution; successful junction unlink plus source rmdir; refused junction/source cleanup after substitution. Expected self-check count becomes exactly 60. Fixture count remains exactly 28; no fixture is added.
8. Public legacy and temporary input schemas, PASS and receipt key order, path grammar, selected-plan/authority behavior, A4.6 reference envelope, and legacy observable behavior remain unchanged.
9. Current Report, verification, and adversarial claims of 56-self-check cleanup coverage or ruled-out midpoint/cleanup behavior are false pending repair. Keep plan/Report/verification/adversarial/risk at `REPAIR REQUIRED`/`REJECT`, `index.json` at `FAIL`, and independent EVL at `NOT_RUN`/`REJECT` until fresh target-60 evidence and independent review exist.
10. Scope remains exactly 29 writable paths, 20 evidence files, and nine manifest paths. The immutable failed `repair.patch` remains read-only, excluded from writable scope and the success conjunction, at exactly `160` bytes / SHA-256 `33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`.

### Exact Test Gates

| Tier | Area | Scenario | Exact command / procedure | What it proves | What it does not prove |
|---|---|---|---|---|---|
| Fully-Automated | Plan/envelope | Final plan and canonical legacy envelope are structurally executable. | Run separately: `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`; `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md`. | Plan structure and exact 29-path legacy authority. | Repair correctness. |
| Fully-Automated | Midpoint cadence | Both mirrors and canonical protocol contain only branch-qualified later reruns. | Native source assertion over `process/development-protocols/vc-system-behavior/09-execute.md`, `.claude/agents/vc-execute-agent.md`, and `.codex/agents/vc-execute-agent.toml`: audit every `preflight`, `envelope`, `rerun`, `re-run`, midpoint, progress-note, and completion instruction; require the temporary lane to have exactly one initial full preflight and no later/per-target full rerun; require legacy initial/mid/completion cadence. | No documented generic later rerun survives. | Agent runtime compliance. |
| Fully-Automated | Cleanup implementation | Cleanup uses identity checks and non-recursive primitives only. | Native source assertion over `validate-execution-authority-envelope.mjs`: reject any `rmSync`; require expected identity/type capture and immediate comparison; require junction/file `unlinkSync`; require source `readdirSync` emptiness plus `rmdirSync`; require mismatch `manual-cleanup-required`; require no deletion call on mismatch branches. | Static cleanup contract and forbidden primitive absence. | Final pathname TOCTOU elimination. |
| Fully-Automated | Fixtures/self-checks | All envelope, original-handle identity/readback, and cleanup cases classify correctly. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope`; require exactly `28 fixture(s) (3 pass-case, 25 negative-case) and 64 self-check(s)`, zero `MISS`, four named cleanup targets, and four named original-handle/readback targets. | Public grammar, prior security checks, exact usable identity semantics, positional readback/EOF, and deterministic matching/substitution cleanup behavior. | Every native Windows reparse tag or universal Windows identity. |
| Fully-Automated | Legacy compatibility | Original legacy behavior remains byte-identical. | Enumerate the original ten non-temporary fixtures in ordinal order and invoke each separately with `spawnSync(process.execPath, [validator, fixture], { cwd, encoding: null, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })`; compare before/after stdout Buffers, stderr Buffers, and integer exits exactly. | Legacy observable compatibility. | Unavailable historical implementation bytes. |
| Hybrid | Creation security | Original `wx+` descriptor binds write, object identity, positional readback, EOF, close, receipt, and live substitution refusal. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --creation-probe`; mandatory PASS. Require the exact ordered `execution-authority-creation-probe/v1` observation, usable original-handle/path identity equality, collision refusal, exact positional readback/EOF receipt, matching-identity cleanup, live rename-and-replace substitution refusal, `manualCleanupRequired: true` at refusal, exact retained-path and unchanged-byte proof, then separate identity-checked harness cleanup. | Exercised original-object binding and standalone controlled substitution refusal. | Universal Windows identity or race freedom after final identity check. |
| Hybrid | Junction security | Normal junction rejection/cleanup and live replaced-junction cleanup refusal are separately exercised. | `node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --junction-probe`; on Windows PASS only with the exact ordered `execution-authority-junction-probe/v1` observation, normal alias rejection, identity-checked normal cleanup, live unlink/recreate substitution refusal against frozen original identity, `manualCleanupRequired: true`, exact retained junction/source proof, then separate identity-checked nonrecursive harness cleanup. `SKIP` is allowed only when privilege/policy prevents canonical junction setup before controlled exercise; every other setup/refusal/proof/cleanup failure is FAIL. | One bounded live Windows junction substitution-refusal case. | Universal reparse-tag coverage or race elimination. |
| Fully-Automated | Syntax/lint/parity | Validator and mirrors remain valid and aligned. | Run separately: `node --check .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; `node node_modules/eslint/bin/eslint.js --no-ignore .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs`. | Syntax, lint, mirror parity, protocol wiring. | Runtime agent behavior. |
| Fully-Automated | Tier-1/regression | Harness and application regression gates remain green. | Run separately: `node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.test.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-seeds.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs`; `node .claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs`; `npm run typecheck:core`; `npm test`. | Harness consistency and bounded/full regression. | Filesystem authority alone. |
| Known-Gap | Frontmatter | Missing validator remains non-green. | `node .claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs`; require expected non-zero `MODULE_NOT_FOUND` and receipt status `SKIP`. | Truthful absence reporting. | Frontmatter correctness. |
| Fully-Automated | Risk/current-state integrity | Evidence scope, immutable patch, retention, and formatting are exact. | Run both risk validators; compare complete nine-path manifest sets and SHA-256-derived differing/new/deleted paths; require exactly 20 evidence filenames and no deletion/unexpected path; reopen/hash every evidence path; verify immutable patch exact identity; run scoped `git diff --check`; assert one final LF after `## EOF`. | Bounded current-state evidence structure. | Independent truth judgment or historical provenance. |
| Agent-Probe | Independent EVL | Fresh reviewer validates repaired bytes, raw evidence, and forbidden claims. | Fresh independent reviewer reopens all 20 evidence files and complete current bytes of every differing/new manifest path, reruns mandatory gates, verifies target60 and both cleanup refusal paths, then writes `independent-evl.json` and the risk decision. | Independent current-state and risk decision. | Missing historical bytes or future OS behavior. |

Failing stub:
```js
test("should apply midpoint full-envelope reruns only to absent-authorityClass legacy Report or Correction", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: legacy-only midpoint envelope cadence")
})
```

Failing stub:
```js
test("should clean only matching creation and junction probe identities without recursive deletion", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: identity-checked fail-closed probe cleanup")
})
```

### Exact Risk State and Permanent Gaps

Risk remains HIGH: `permission, secret, or trust-boundary logic` and `public API or external contract changes`. `mustStopBeforeFinalize` remains `true`. EXECUTE must leave final risk decision `REJECT`; only fresh independent EVL may write `APPROVE`.

Permanent gaps retained in every final decision surface:

- `PRE_EDIT_BASELINE_UNAVAILABLE`.
- `REPAIR_BASELINE_BYTES_UNRECOVERABLE`.
- Universal Windows reparse-tag coverage is unproven.
- Residual pathname TOCTOU is reduced but not eliminated.
- `.claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs` is absent and non-green.
- Ignored task-folder evidence is not portable across cleanup or clone.

Forbidden claims remain: historical patch PASS; reconstructed before bytes; universal reparse safety; race elimination; frontmatter PASS; shell fallback represented as exact direct invocation; executor self-approval; A4.6 readiness before independent EVL/risk approval.

### Exact Writable Scope

The legacy envelope below authorizes exactly 29 writable paths: three implementation/prompt paths, five risk paths, nineteen evidence paths, the selected plan, and the canonical Report. No deletion is authorized. The twentieth evidence file, `repair.patch`, is immutable and excluded from writable scope.

### Stops

1. The immutable `repair.patch` differs from exact `160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`, is rewritten, represented as PASS, or included in the success conjunction.
2. Either permanent unavailable marker is omitted or any claim reconstructs historical before bytes or patch provenance.
3. The exact nine-path manifest entry sets drift, any new/deleted/unexpected path exists, or exhaustive complete-byte independent review is missing for any differing/new path.
4. Any original legacy fixture stdout/stderr Buffer, integer exit, validation order, error source, PASS shape, Report/Correction behavior, or compatibility contract changes.
5. Either EXECUTE mirror or canonical protocol applies any midpoint, completion, per-target, or other later full-envelope rerun to `temporary-artifact-set/v1`, or fails to preserve legacy initial/mid/completion cadence.
6. Any cleanup uses `rmSync`, recursive deletion, identity-blind unlink/rmdir, follows/removes a substituted tree, deletes after identity/type/emptiness mismatch, omits exact retained paths, or fails to return probe failure with `manual-cleanup-required`.
7. The fixture suite is not exactly 28/3/25 with exactly 60 self-checks, any of the four cleanup targets misclassifies, or any mandatory probe/parity/wiring/lint/typecheck/test/risk/retention/diff/whitespace/EOF gate fails; only the named junction/frontmatter outcomes may be `SKIP`.
8. Any public temporary or legacy schema, path grammar, PASS/receipt ordering, selected-plan/authority semantics, A4.6 reference, initial temporary preflight, per-target precreate/postreadback checks, or legacy observable behavior changes.
9. Any risk/status surface claims final PASS/COMPLETE/VERIFIED/APPROVE before fresh independent EVL, or the reviewer is not independent of implementation.
10. Any A4.6 plan/artifact/candidate, application source/test/config, package/lockfile/dependency, Git state/action, build/deploy output/config, network/provider/secret/external service, deletion, irreversible, destructive, or cost-generating action is requested, or any write falls outside the exact 29 paths.

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_AUTOPILOT_GOAL_26-08-26.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs",
    ".claude/agents/vc-execute-agent.md",
    ".codex/agents/vc-execute-agent.toml",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/risk-gate.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/context-snippets.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/verification.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/review-decision.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/adversarial-validation.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/index.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/pre-edit-baseline.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-baseline-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/repair-after-manifest.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-before.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/legacy-after.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/fixture-suite.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/validator-syntax.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/temporary-pass.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/creation-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/junction-probe.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/eslint.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/typecheck-core.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/npm-test.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/tier1-audits.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/frontmatter-known-gap.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/risk-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/diff-gates.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/harness/evidence/independent-evl.json",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_PLAN_26-08-26.md",
    "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md"
  ],
  "stop_conditions": [
    "The immutable repair.patch differs from exact 160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35, is rewritten, represented as PASS, or included in the success conjunction.",
    "Either permanent unavailable marker is omitted, historical before bytes or patch provenance are claimed reconstructed, or the exact nine-path manifest/current-state review contract drifts.",
    "Any original legacy fixture stream, exit, validation order, error source, PASS shape, Report or Correction behavior, public schema, path grammar, receipt order, A4.6 reference, or compatibility contract changes.",
    "Any temporary midpoint, completion, per-target, or other later full-envelope rerun remains, or legacy initial, midpoint, and completion full-envelope cadence changes.",
    "Any cleanup uses recursive deletion, rmSync, identity-blind unlink or rmdir, follows or removes a substituted tree, deletes after mismatch, or fails closed without manual-cleanup-required and exact retained paths.",
    "The fixture suite is not exactly 28 fixtures with 3 pass and 25 negative plus exactly 60 self-checks, any four cleanup target misclassifies, or any mandatory gate fails beyond the named junction/frontmatter SKIP outcomes.",
    "Any risk, status, evidence, receipt, Report, index, or independent-review claim is inaccurate, premature, or approved by the executor rather than fresh independent EVL.",
    "Any A4.6, candidate, application, dependency, Git, build, deploy, network, provider, secret, external-service, deletion, irreversible, destructive, or cost-generating action is requested, any write target falls outside exact allowed_scope, or any standing hard stop is reached."
  ],
  "artifact_path": "process/general-plans/active/execution-authority-temp-artifact-set_26-08-26/execution-authority-temp-artifact-set_REPORT_26-08-26.md",
  "artifact_schema_version": "phase-report/v1"
}
```

### Historical Handoff — Invalidated

The preceding PASS contract, envelope, test target, and EXECUTE handoff are historical and non-executable. They do not cover the original-handle or standalone live substitution requirements and grant no authority.

## Validate Contract

Status: BLOCKED
Date: 2026-08-27
date: 2026-08-27
generated-by: PLAN amendment placeholder
supersedes: 2026-08-27 (outer-pvl — invalidated by original-handle and standalone-probe amendment)

**Gate: BLOCKED.** Fresh VALIDATE must replace this placeholder after validating AC-05/AD-03A original-handle identity/readback, exactly 64 self-checks, mandatory standalone creation substitution refusal, the Windows junction substitution workflow or privilege/policy-only SKIP, exact 29 writable paths, exact 20 evidence files, exact nine manifest paths, immutable `repair.patch` `160/33284331892c7a6cf5aca851d60e2af657121dd426da4ac71f06f5eb58e17f35`, corrected pending Report/verification/adversarial claims, permanent gaps, and risk `REJECT`. No execution-authority envelope is valid or emitted by PLAN.

## EOF
