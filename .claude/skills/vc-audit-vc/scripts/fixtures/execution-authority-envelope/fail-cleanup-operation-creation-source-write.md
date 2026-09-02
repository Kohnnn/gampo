# Fixture — Cleanup Operation and Write Denial

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "wrong-unlink-role", "path": "allowed_scope.0.operation", "value": "rmdir" },
  { "name": "wrong-rmdir-role", "path": "allowed_scope.2.operation", "value": "unlink" },
  { "name": "create-verb", "path": "allowed_scope.0.operation", "value": "create" },
  { "name": "rename-verb", "path": "allowed_scope.0.operation", "value": "rename" },
  { "name": "recursive-verb", "path": "allowed_scope.2.operation", "value": "rm-recursive" },
  { "name": "creation-count", "path": "creation_count", "value": 1 },
  { "name": "source-write-count", "path": "source_write_count", "value": 1 },
  { "name": "receipt-widening", "path": "cleanup_receipt_schema_version", "value": "fixture-residue-cleanup-receipt/v3" }
]
```
