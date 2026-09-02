# Fixture — Cleanup Basename Encoding and Components

## Validate Contract

```json cleanup-negative-cases/v1
[
  { "name": "invalid-base64", "path": "allowed_scope.0.basename_b64", "value": "%%%=" },
  { "name": "noncanonical-base64", "path": "allowed_scope.0.basename_b64", "value": "QQ" },
  { "name": "slash-component", "path": "allowed_scope.0.basename_b64", "value": "YS9i" },
  { "name": "dot", "path": "allowed_scope.0.basename_b64", "value": "Lg==" },
  { "name": "dot-dot", "path": "allowed_scope.0.basename_b64", "value": "Li4=" },
  { "name": "nul", "path": "allowed_scope.0.basename_b64", "value": "YQBi" },
  { "name": "nested-normal-name", "path": "allowed_scope.0.basename_b64", "value": "bmVzdGVkL2ZpbGU=" }
]
```
