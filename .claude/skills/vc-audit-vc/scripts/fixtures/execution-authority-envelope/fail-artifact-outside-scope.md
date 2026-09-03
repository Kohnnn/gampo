# Fixture — Artifact Outside Allowed Scope

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/outside/fail-artifact-outside-scope-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
The artifact path is a well-formed relative path and equals the Report destination, but it
falls outside every exact entry in `allowed_scope`.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-artifact-outside-scope.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-artifact-outside-scope.md",
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-artifact-outside-scope-report.md"
  ],
  "stop_conditions": [
    "outward-facing action"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/outside/fail-artifact-outside-scope-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
