# Fixture — Cleanup Duplicate and Broad Scope

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "duplicate-bytes", "path": "allowed_scope.1.basename_b64", "value": "QzpcVXNlcnNcQWRtaW5cQXBwRGF0YVxMb2NhbFxUZW1wXG9wZW5jb2RlXGV4ZWN1dGlvbi1hdXRob3JpdHktY2xlYW51cC1qdW5jdGlvbi0xMDEtMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExLWxpbms=" },
  { "name": "duplicate-identity", "path": "allowed_scope.1.ino", "value": "1001" },
  { "name": "reordered-ordinal", "path": "allowed_scope.0.ordinal", "value": 2 },
  { "name": "gapped-ordinal", "path": "allowed_scope.5.ordinal", "value": 8 },
  { "name": "wildcard", "path": "allowed_scope.0.basename_b64", "value": "Kg==" },
  { "name": "subtree", "path": "allowed_scope.0.basename_b64", "value": "Kio=" },
  { "name": "root", "path": "allowed_scope.0.basename_b64", "value": "Lg==" },
  { "name": "ninth-target", "path": "allowed_scope", "operation": "append", "value": {} }
]
```
