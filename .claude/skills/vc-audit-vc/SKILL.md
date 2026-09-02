---
name: vc-audit-vc
description: >-
  Audit agent harness health: Claude/Codex agent parity, skill registry
  consistency, README.md sync, and protocol file wiring. Use when agents,
  skills, README.md, or development-protocol files move, split, or drift.
trigger_keywords: harness audit, agent parity, skill audit, guide sync
layer: contract
---

# Audit VC (Version Control Harness Health)

> **Output style:** Follow `process/development-protocols/communication-standards.md` — answer-first, plain language, no unexplained jargon, TL;DR on long responses.

Use this skill to verify that the agent harness layer is internally consistent
and correctly wired across Claude, Codex, README.md, and protocol files.

For context routing, grouping, and discoverability audits, use the `audit-context` skill instead.

## Workflow

1. Run the Claude/Codex agent parity validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-agent-parity.mjs
   ```
2. Run the shared skill discovery validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-skills.mjs
   ```
3. Run the catalog (README.md) sync validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.mjs
   node .claude/skills/vc-audit-vc/scripts/validate-guide-sync.test.mjs
   ```
   This audits the **kit catalog** README — the one carrying `## N Agents` / `## N Skills`
   sections (the same counts `vc-publish` badge-checks). In a consuming project whose
   `README.md` is an application doc, it reports `skipped` with zero failures instead of
   flagging every agent and skill as missing; consuming projects are not expected to
   carry a harness catalog. Use `--guide <path>` to point at an explicit catalog file.
   An explicit `--guide` path that does not exist is a hard failure, never a skip.
   The `.test.mjs` self-check proves the validator stays load-bearing: a complete catalog
   passes, a catalog missing one agent and one skill fails with exactly those two findings,
   an application README skips cleanly, and an agents-only catalog still audits.
4. Run the protocol wiring validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-protocol-wiring.mjs
   ```
5. Run the seed/scaffold consistency validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-seeds.mjs
   ```
6. Run the kit portability validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-kit-portability.mjs
   ```
7. Run the skill invocation wiring validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-skill-invocation-wiring.mjs
   ```
8. Run the agent frontmatter validator:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-agent-frontmatter.mjs
   ```
   **Known gap:** this script is prescribed here but is NOT present on disk. The command
   currently fails with a module-not-found error. Do not count it as a passing check and do
   not report frontmatter as validated until the script exists.
9. Run the execution authority envelope validator against a selected plan:
   ```bash
   node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs <selected-plan-path>
   ```
    Applies only to plans whose `## Validate Contract` carries an
    `execution-authority-envelope/v1` block. Exit 0 means the plan's authority, scope,
    schema-selected Report or Correction destination, and artifact schema are internally
    consistent. A non-zero exit emits `AUTHORITY_ENVELOPE_BLOCKED: <reason>. Remediation: ...`.

    With `authorityClass` absent, the validator preserves the exact legacy six-field Report/Correction branch, validation/error order, and PASS output; decoded escaped-equivalent duplicate-key hardening is not applied to that lane. `authorityClass: "temporary-artifact-set/v1"` selects an isolated eight-field branch authorizing 1–8 exact unique absolute files strictly beneath `C:\Users\Admin\AppData\Local\Temp\opencode`. It rejects mixed fields, count/schema drift, decoded duplicate JSON keys, traversal/globs/namespaces/ADS/trailing aliases, reserved DOS device basenames including extension and superscript aliases, prefix collisions, existing targets, and Node-observable reparse ancestry. Temporary PASS output contains ordered `status,authorityClass,selected_plan,mode,proof_path,scope_count,stop_condition_count,artifact_receipt_schema_version,artifact_paths` keys; paths are deterministic normalized display values, not canonical filesystem identity.

    `authorityClass: "repository-diagnostic-evidence-set/v2"` selects the additive production diagnostic branch. Its envelope has exact ordered `operation_root`, `registry_root`, `runtime_root`, and `evidence_root` fields, and the registry must declare those four roots byte-identically before capability or destination validation. Every role root is a strict, pairwise-disjoint descendant of the operation root under lexical, normalized separator/case, realpath, ancestry, reparse, and filesystem-identity checks. One bounded registry primitive freezes the regular single-link file and complete operation-to-file ancestor chain before allocating or reading 1–1048576 exact bytes, then rechecks all identities and relationships. One authority rechecker guards B01–B10 create/open, spawn, publication, cleanup, fsync, and exit boundaries with deterministic primary/secondary failure truth. All 72 create-only destinations are strict descendants of `evidence_root`; HOME, TAR, streams, and temporary state are strict descendants of `runtime_root`; cleanup cannot target registry or evidence. The envelope binds a clean committed runner by normalized absolute path, exact bytes/SHA-256, blob OID, and commit OID, and one variable-path canonical `repository-diagnostic-command-registry/v1` with exactly 18 rows and 16 semantic kinds. The postcommit check executes all 18 safe fake direct-argv children, persists 72 destinations, completes terminal/result-or-failure/cleanup ordering, preserves registry/evidence, and removes runtime through an instrumented exact-identity unlink/bottom-up-rmdir ledger whose operation stream computes zero recursive deletion. The exact 335-check runner suite injects drift at the ten production B01–B10 effect adapters; all 64 v2 and 11 behavior negatives use full production validation with real isolated topology and bytes. Drift fixtures mutate isolated copies only, shared runner/validator paths remain read-only, and `--concurrency-stress --parallel 4 --repeat 4` must prove 32/32 subprocesses, stable source SHAs, zero shared-source writes, and zero residue. IDs are labels only. Permit only version probes, validators, five-path Git reads, frozen commit/tree reads, and one owned TAR archive; reject product, network, browser-launch, package, shell/eval, global Git, mutation, ambient-secret, and uncommitted `src/sportsbook/**` access before effect.

    `authorityClass: "repository-diagnostic-evidence-set/v1"` selects the closed repository-local diagnostic branch. It requires exact canonical runner/registry paths, source/fenced-registry byte hashes, closed registry and artifact schemas, create-only scope, and a closed `repository-diagnostic-behavioral-execution-receipt/v1` bound to fresh deterministic direct-argv `shell:false` execution. Registry command IDs grant no capability: exact `executable,argv,action,lifecycle` tuples do. `CMD_RM` with safe argv passes; dangerous argv/action under any name rejects. The fixed runner performs real fixture-safe diagnostics, complete terminal/result/failure/cleanup lifecycle evidence, exact `{dev,ino,mode,nlink,realpath,type}` identity freezes for every existing ancestor with full-chain checks before create, after open, after file fsync/readback, and before parent fsync; field-by-field artifact mutation checks through production validators; and size-aware fail-closed TAR traversal including case-insensitive `CLOCK$`, standard DOS device aliases, and Unicode NFKC-equivalent superscript-digit aliases with extensions/trailing spaces/dots and nested paths. Deleting or mutating the behavioral receipt blocks.
10. Run the envelope fixture suite; derive pass/negative counts from runtime output rather than frozen prose:

    ```bash
    node .claude/skills/vc-audit-vc/scripts/validate-execution-authority-envelope.mjs --fixtures .claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope
    ```
11. If any script reports failures, inspect the referenced files and patch the smallest
    relevant surface.
12. Re-run the failed validators until they pass.

Temporary execution uses one initial envelope preflight, then immediate per-target production checks and exclusive creation. The validator exposes bounded `--creation-probe` and optional Windows `--junction-probe` checks. Receipts use ordered `schema,artifactPath,artifactSchemaVersion,bytes,sha256,exclusiveCreate,regularNonReparse,readbackMatches,status` keys and remain evidence, never another authorized file.

**Scope note:** these validators check harness wiring and declared plan contracts. The temporary branch checks current filesystem identity but does not intercept later writes or eliminate TOCTOU races. Node `realpath`/`lstat` cannot prove every Windows reparse tag; a blocked junction probe is `SKIP`, never PASS. A green run of any subset does not mean the whole harness audit is green; report per-validator results, not a blanket pass.

## Rules

- Treat `.claude/agents/` as canonical for agent definitions; `.codex/agents/` mirrors them.
- Treat `.claude/skills/` as canonical for skills; `.agents/skills/` is the Codex discovery symlink.
- When updating agents, mirror Claude markdown and Codex TOML surfaces together.
- Treat `process/_seeds/` as an optional legacy scaffold surface in the live repo. Its absence is a warning-only audit result unless the user is explicitly auditing export-kit scaffolding.
- Treat validator warnings as audit findings unless the user asks for a strict cleanup.
- For context routing and discoverability audits, delegate to `audit-context`.
