# Fixture — Valid Execution Authority Envelope

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/pass-envelope-report.md`

## Overview

Fixture plan for `validate-execution-authority-envelope.mjs`. Expected result: **exit 0**.
Proves six-field schema, standing-granted proof, normalized scope, Report destination
equality, and `phase-report/v1`.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-envelope.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "outward-facing action",
    "irreversible action",
    "out-of-scope path or contract deviation"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/pass-envelope-report.md",
  "artifact_schema_version": "phase-report/v1"
}
```
