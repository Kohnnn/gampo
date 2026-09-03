# Fixture — Invalid Artifact Path

**Report destination:** `../../../../outside-repo/fail-invalid-artifact-path-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
The artifact path uses `..` traversal segments and therefore is rejected during path
normalization, before any scope comparison. Windows-separator normalization and the
absolute/UNC/drive forms are asserted by the validator self-check cases.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-invalid-artifact-path.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "outward-facing action"
  ],
  "artifact_path": "..\\..\\..\\..\\outside-repo\\fail-invalid-artifact-path-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
