# Fixture — Valid Correction Execution Authority Envelope

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/original-published-report.md`

**Correction destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/pass-correction-envelope.md`

## Overview

Expected result: **exit 0**. The original Report destination may coexist but does not bind the correction artifact.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/pass-correction-envelope.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "outward-facing action",
    "overwrite of the original Report"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/pass-correction-envelope.md",
  "artifact_schema_version": "phase-report-correction/v1"
}
```
