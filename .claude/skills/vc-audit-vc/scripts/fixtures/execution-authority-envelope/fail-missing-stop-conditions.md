# Fixture — Missing Stop Conditions

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-missing-stop-conditions-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
`stop_conditions` is present but empty, so the explicit hard stops are absent.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-missing-stop-conditions.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-missing-stop-conditions-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
