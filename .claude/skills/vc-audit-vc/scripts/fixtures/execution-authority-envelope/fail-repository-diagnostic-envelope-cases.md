# Fixture — Repository Diagnostic Envelope Negative Cases

All 64 v2 cases require the public production-envelope entrypoint with real isolated topology, canonical bound registry bytes, filesystem checks enabled, no acceptance-path `skipFilesystem`, and exact identity-ledger teardown.

## Validate Contract

```json repository-diagnostic-envelope-negative-cases/v1
[
  { "name": "mixed-lane-field", "path": "artifact_path", "value": "mixed.md" },
  { "name": "target-outside-root", "path": "allowed_scope.0.artifact_path", "value": ".claude/outside.json" },
  { "name": "product-target", "path": "evidence_root", "value": "src/evidence" },
  { "name": "duplicate-target", "path": "allowed_scope.1.artifact_path", "value": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/terminal.json" },
  { "name": "scope-count-drift", "path": "scope_count", "value": 99 },
  { "name": "unknown-artifact-role", "path": "allowed_scope.0.artifact_role", "value": "product" },
  { "name": "unknown-artifact-schema", "path": "allowed_scope.0.artifact_schema_version", "value": "unknown" },
  { "name": "not-create-only", "path": "allowed_scope.0.create_only", "value": false },
  { "name": "product-capable-registry-row", "path": "diagnostic_registry.rows.0.command_id", "value": "CMD_BUILD_PRODUCT" }
]
```

```json repository-diagnostic-envelope-negative-cases/v2
[
  { "name": "v2-relative-executable", "path": "rows.0.executable", "value": "node" },
  { "name": "v2-git-version-denied", "path": "rows.2.argv", "value": ["--version"] },
  { "name": "v2-global-status-denied", "path": "rows.10.argv", "value": ["status", "--porcelain=v1"] },
  { "name": "v2-sportsbook-live-path-denied", "path": "live_pathspecs.0", "value": "src/sportsbook/live.js" },
  { "name": "v2-nineteenth-row-denied", "path": "rows", "operation": "duplicate-last" },
  { "name": "v2-unknown-semantic-denied", "path": "rows.0.semantic.kind", "value": "eval/v1" },
  { "name": "v2-evidence-outside-owned-root", "path": "rows.0.evidence.pre_receipt", "value": "/fixture/repository/outside.json" },
  { "name": "v2-registry-root-equals-operation-root", "path": "registry_root", "value": "/fixture/repository/.agent/operation" },
  { "name": "v2-runtime-root-equals-registry-root", "path": "runtime_root", "value": "/fixture/repository/.agent/operation/registry" },
  { "name": "v2-evidence-root-beneath-runtime-root", "path": "evidence_root", "value": "/fixture/repository/.agent/operation/runtime/evidence" },
  { "name": "v2-registry-root-outside-operation-root", "path": "registry_root", "value": "/fixture/repository/outside-registry" },
  { "name": "v2-operation-root-filesystem-root", "path": "operation_root", "value": "/" },
  { "name": "v2-home-beneath-evidence-root", "path": "rows.0.env.HOME", "value": "/fixture/repository/.agent/operation/evidence/home" },
  { "name": "v2-archive-beneath-evidence-root", "path": "rows.17.semantic.parameters.archive_path", "value": "/fixture/repository/.agent/operation/evidence/tree.tar" },
  { "name": "v2-evidence-equals-evidence-root", "path": "rows.0.evidence.pre_receipt", "value": "/fixture/repository/.agent/operation/evidence" },
  { "name": "v2-evidence-beneath-registry-root", "path": "rows.0.evidence.pre_receipt", "value": "/fixture/repository/.agent/operation/registry/pre.json" },
  { "name": "v2-case-folded-duplicate-destination", "path": "rows.1.evidence.pre_receipt", "value": "/FIXTURE/REPOSITORY/.AGENT/OPERATION/EVIDENCE/1-PRE.JSON" },
  { "name": "v2-separator-normalized-duplicate-destination", "path": "rows.1.evidence.pre_receipt", "value": "/fixture/repository/.agent/operation/evidence//1-pre.json" },
  { "name": "v2-missing-operation-root", "path": "operation_root", "operation": "delete" },
  { "name": "v2-missing-registry-root", "path": "registry_root", "operation": "delete" },
  { "name": "v2-missing-runtime-root", "path": "runtime_root", "operation": "delete" },
  { "name": "v2-missing-evidence-root", "path": "evidence_root", "operation": "delete" },
  { "name": "v2-extra-root", "path": "extra_root", "value": "/fixture/extra" },
  { "name": "v2-operation-root-byte-different", "path": "operation_root", "value": "/fixture/repository/.agent/operation/other" },
  { "name": "v2-registry-root-byte-different", "path": "registry_root", "value": "/fixture/repository/.agent/operation/registry/other" },
  { "name": "v2-runtime-root-byte-different", "path": "runtime_root", "value": "/fixture/repository/.agent/operation/runtime/other" },
  { "name": "v2-evidence-root-byte-different", "path": "evidence_root", "value": "/fixture/repository/.agent/operation/evidence/other" },
  { "name": "v2-operation-root-case-alias", "path": "operation_root", "value": "/FIXTURE/REPOSITORY/.AGENT/OPERATION" },
  { "name": "v2-registry-root-case-alias", "path": "registry_root", "value": "/FIXTURE/REPOSITORY/.AGENT/OPERATION/REGISTRY" },
  { "name": "v2-runtime-root-case-alias", "path": "runtime_root", "value": "/FIXTURE/REPOSITORY/.AGENT/OPERATION/RUNTIME" },
  { "name": "v2-evidence-root-case-alias", "path": "evidence_root", "value": "/FIXTURE/REPOSITORY/.AGENT/OPERATION/EVIDENCE" },
  { "name": "v2-operation-root-separator-alias", "path": "operation_root", "value": "/fixture/repository/.agent//operation" },
  { "name": "v2-registry-root-separator-alias", "path": "registry_root", "value": "/fixture/repository/.agent/operation//registry" },
  { "name": "v2-runtime-root-separator-alias", "path": "runtime_root", "value": "/fixture/repository/.agent/operation//runtime" },
  { "name": "v2-evidence-root-separator-alias", "path": "evidence_root", "value": "/fixture/repository/.agent/operation//evidence" },
  { "name": "v2-operation-root-dot-alias", "path": "operation_root", "value": "/fixture/repository/.agent/./operation" },
  { "name": "v2-registry-root-dot-alias", "path": "registry_root", "value": "/fixture/repository/.agent/operation/registry/" },
  { "name": "v2-runtime-root-dot-alias", "path": "runtime_root", "value": "/fixture/repository/.agent/operation/./runtime" },
  { "name": "v2-evidence-root-dot-alias", "path": "evidence_root", "value": "/fixture/repository/.agent/operation/evidence/" },
  { "name": "v2-operation-root-realpath-alias", "path": "operation_root", "value": "/fixture/repository/.agent/operation-link" },
  { "name": "v2-registry-root-realpath-alias", "path": "registry_root", "value": "/fixture/repository/.agent/operation/registry-link" },
  { "name": "v2-runtime-root-realpath-alias", "path": "runtime_root", "value": "/fixture/repository/.agent/operation/runtime-link" },
  { "name": "v2-evidence-root-realpath-alias", "path": "evidence_root", "value": "/fixture/repository/.agent/operation/evidence-link" },
  { "name": "v2-operation-root-identity-alias", "path": "operation_root", "value": "/fixture/repository/.agent/identity" },
  { "name": "v2-registry-root-identity-alias", "path": "registry_root", "value": "/fixture/repository/.agent/operation/identity" },
  { "name": "v2-runtime-root-identity-alias", "path": "runtime_root", "value": "/fixture/repository/.agent/operation/identity" },
  { "name": "v2-evidence-root-identity-alias", "path": "evidence_root", "value": "/fixture/repository/.agent/operation/identity" },
  { "name": "v2-actual-commit-mismatch", "target": "both", "path": "head_commit_oid", "operation": "alternate-oid" },
  { "name": "v2-actual-tree-mismatch", "target": "both", "path": "head_tree_oid", "operation": "alternate-oid" },
  { "name": "v2-malformed-commit-oid", "target": "envelope", "path": "head_commit_oid", "value": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
  { "name": "v2-uppercase-tree-oid", "target": "envelope", "path": "head_tree_oid", "operation": "uppercase" },
  { "name": "v2-registry-commit-mismatch", "target": "registry", "path": "head_commit_oid", "operation": "alternate-oid" },
  { "name": "v2-registry-tree-mismatch", "target": "registry", "path": "head_tree_oid", "operation": "alternate-oid" },
  { "name": "v2-stop-count-below-range", "target": "envelope", "path": "stop_conditions", "operation": "below-range" },
  { "name": "v2-stop-count-above-range", "target": "envelope", "path": "stop_conditions", "operation": "above-range" },
  { "name": "v2-stop-count-array-mismatch", "target": "envelope", "path": "stop_condition_count", "value": 6 },
  { "name": "v2-stop-malformed-category", "target": "envelope", "path": "stop_conditions.0", "value": "unknown-category: stop immediately" },
  { "name": "v2-stop-duplicate-category", "target": "envelope", "path": "stop_conditions.1", "operation": "duplicate-first" },
  { "name": "v2-stop-missing-scope-contract-deviation", "target": "envelope", "path": "stop_conditions", "operation": "remove-category", "value": "scope-contract-deviation" },
  { "name": "v2-stop-missing-repository-state-isolation", "target": "envelope", "path": "stop_conditions", "operation": "remove-category", "value": "repository-state-isolation" },
  { "name": "v2-stop-missing-authority-integrity-drift", "target": "envelope", "path": "stop_conditions", "operation": "remove-category", "value": "authority-integrity-drift" },
  { "name": "v2-stop-missing-forbidden-product-or-external-operation", "target": "envelope", "path": "stop_conditions", "operation": "remove-category", "value": "forbidden-product-or-external-operation" },
  { "name": "v2-stop-missing-evidence-or-gate-failure", "target": "envelope", "path": "stop_conditions", "operation": "remove-category", "value": "evidence-or-gate-failure" },
  { "name": "v2-stop-duplicate-text-and-category", "target": "envelope", "path": "stop_conditions.4", "operation": "duplicate-first" }
]
```
