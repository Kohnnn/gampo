# Fixture — Valid Repository Diagnostic Evidence Set

## Validate Contract

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md",
  "authority_mode": { "mode": "standing-granted", "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md" },
  "authorityClass": "repository-diagnostic-evidence-set/v1",
  "evidence_root": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope",
  "diagnostic_registry": {
    "schema": "repository-diagnostic-registry/v1",
    "registry_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md",
    "registry_sha256": "e72b75409d9e2f63c68400621559049789b74e97bdb84f8fd9861bebeebb0c25",
    "row_count": 2,
    "rows": [
      { "ordinal": 1, "command_id": "CMD_RM", "capability": "diagnostic-only", "executable": "node", "argv": ["--diagnostic-op", "node-version"], "action": "node-version", "lifecycle": "diagnostic", "artifact_roles": ["bootstrap", "terminal", "result", "failure", "stdout", "stderr", "row-receipt"] },
      { "ordinal": 2, "command_id": "RENAMED_SAFE_OPERATION", "capability": "diagnostic-only", "executable": "node", "argv": ["--diagnostic-op", "parse-tar"], "action": "parse-tar", "lifecycle": "cleanup", "artifact_roles": ["cleanup", "manifest"] }
    ]
  },
  "allowed_scope": [
    { "ordinal": 1, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/terminal.json", "artifact_role": "terminal", "artifact_schema_version": "phase02-executor-terminal/v1", "create_only": true },
    { "ordinal": 2, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/result.json", "artifact_role": "result", "artifact_schema_version": "phase02-attempt-result/v1", "create_only": true },
    { "ordinal": 3, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/failure.json", "artifact_role": "failure", "artifact_schema_version": "phase02-bootstrap-failure/v1", "create_only": true },
    { "ordinal": 4, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/cleanup.json", "artifact_role": "cleanup", "artifact_schema_version": "phase02-attempt-cleanup/v1", "create_only": true },
    { "ordinal": 5, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/bootstrap.mjs", "artifact_role": "bootstrap", "artifact_schema_version": "phase02-bootstrap-source/v1", "create_only": true },
    { "ordinal": 6, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/manifest.json", "artifact_role": "manifest", "artifact_schema_version": "phase02-evidence-manifest/v1", "create_only": true },
    { "ordinal": 7, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/stdout.bin", "artifact_role": "stdout", "artifact_schema_version": "phase02-stdout/v1", "create_only": true },
    { "ordinal": 8, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/stderr.bin", "artifact_role": "stderr", "artifact_schema_version": "phase02-stderr/v1", "create_only": true },
    { "ordinal": 9, "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/evidence/repository-diagnostic/row-001.json", "artifact_role": "row-receipt", "artifact_schema_version": "phase02-row-receipt/v1", "create_only": true }
  ],
  "scope_count": 9,
  "stop_conditions": ["product command", "source write", "external mutation", "identity mismatch"],
  "stop_condition_count": 4,
  "artifact_receipt_schema_version": "repository-diagnostic-artifact-receipt/v1"
}
```

```json repository-diagnostic-registry/v1
{
  "schema": "repository-diagnostic-registry/v1",
  "fixture_mode": true,
  "rows": [
    { "ordinal": 1, "command_id": "CMD_RM", "capability": "diagnostic-only", "executable": "node", "argv": ["--diagnostic-op", "node-version"], "action": "node-version", "lifecycle": "diagnostic", "artifact_roles": ["bootstrap", "terminal", "result", "failure", "stdout", "stderr", "row-receipt"] },
    { "ordinal": 2, "command_id": "RENAMED_SAFE_OPERATION", "capability": "diagnostic-only", "executable": "node", "argv": ["--diagnostic-op", "parse-tar"], "action": "parse-tar", "lifecycle": "cleanup", "artifact_roles": ["cleanup", "manifest"] }
  ]
}
```

Fixed runner: `.claude/skills/vc-audit-vc/scripts/run-repository-diagnostic-evidence.mjs`
Fixed runner SHA-256: `4054c980bdc4134e15b3c7c3385d963426e50ac5658be2b93f409182d63f1d05`

```json repository-diagnostic-behavioral-execution-receipt/v1
{
  "schema": "repository-diagnostic-behavioral-execution-receipt/v1",
  "runnerPath": ".claude/skills/vc-audit-vc/scripts/run-repository-diagnostic-evidence.mjs",
  "runnerSha256": "4054c980bdc4134e15b3c7c3385d963426e50ac5658be2b93f409182d63f1d05",
  "registryPath": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-repository-diagnostic-evidence-set.md",
  "registrySha256": "e72b75409d9e2f63c68400621559049789b74e97bdb84f8fd9861bebeebb0c25",
  "executionStatus": "PASS",
  "terminalCount": 2,
  "terminalSha256": "079380eccb5db41e4852d1634453d77641f375a40976a8e1dd9f00b64e1e8672",
  "status": "PASS"
}
```
