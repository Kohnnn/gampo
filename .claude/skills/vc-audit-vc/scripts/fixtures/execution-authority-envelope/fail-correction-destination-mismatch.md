# Fixture — Correction Destination Mismatch

**Report destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/original-published-report.md`

**Correction destination:** `.claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/declared-correction.md`

## Overview

Expected result: **non-zero** because `artifact_path` differs from the one Correction destination.

## Validate Contract

Status: PASS

### Execution Authority & Evidence Envelope

```json execution-authority-envelope/v1
{
  "selected_plan": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/fail-correction-destination-mismatch.md",
  "authority_mode": {
    "mode": "standing-granted",
    "proof_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/proof/standing-goal-block.md"
  },
  "allowed_scope": [
    ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/**"
  ],
  "stop_conditions": [
    "overwrite of the original Report"
  ],
  "artifact_path": ".claude/skills/vc-audit-vc/scripts/fixtures/execution-authority-envelope/reports/different-correction.md",
  "artifact_schema_version": "phase-report-correction/v1"
}
```
