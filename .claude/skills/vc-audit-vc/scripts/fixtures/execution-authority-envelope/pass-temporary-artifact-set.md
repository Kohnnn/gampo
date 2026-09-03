# Fixture — Valid Temporary Artifact Set

## Validate Contract

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-temporary-artifact-set.md",
  "authority_mode": { "mode": "standing-granted", "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md" },
  "authorityClass": "temporary-artifact-set/v1",
  "allowed_scope": [{ "artifact_path": "C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\fixture-temp-artifact.json", "artifact_schema_version": "fixture-temp-artifact/v1" }],
  "scope_count": 1,
  "stop_conditions": ["collision", "reparse"],
  "stop_condition_count": 2,
  "artifact_receipt_schema_version": "execution-temp-artifact-receipt/v1"
}
```
