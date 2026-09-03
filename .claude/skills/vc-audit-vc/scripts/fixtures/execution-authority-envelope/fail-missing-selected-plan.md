# Fixture — Missing Selected Plan

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-missing-selected-plan-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **non-zero**.
The `selected_plan` field is absent, so the handoff cannot be executed.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
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
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/fail-missing-selected-plan-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
