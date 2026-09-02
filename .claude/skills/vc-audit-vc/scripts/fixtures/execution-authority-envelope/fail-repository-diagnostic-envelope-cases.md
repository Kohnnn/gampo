# Fixture — Repository Diagnostic Envelope Negative Cases

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
  { "name": "v2-evidence-outside-owned-root", "path": "rows.0.evidence.pre_receipt", "value": "/fixture/repository/outside.json" }
]
```
