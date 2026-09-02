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
