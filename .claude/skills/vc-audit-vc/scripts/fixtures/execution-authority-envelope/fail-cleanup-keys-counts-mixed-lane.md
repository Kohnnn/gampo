# Fixture — Cleanup Keys, Counts, Mixed Lane

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "missing-key", "path": "operation_count", "operation": "delete" },
  { "name": "extra-key", "path": "artifact_path", "value": "x" },
  { "name": "wrong-scope-count", "path": "scope_count", "value": 5 },
  { "name": "wrong-operation-count", "path": "operation_count", "value": 7 },
  { "name": "unknown-class", "path": "authorityClass", "value": "unknown/v1" },
  { "name": "mixed-temporary-field", "path": "artifact_receipt_schema_version", "value": "execution-temp-artifact-receipt/v1" }
]
```
