# Fixture — Repository Diagnostic Behavior Negative Cases

## Validate Contract

```json repository-diagnostic-behavior-negative-cases/v1
[
  { "name": "placeholder-source-production-path", "kind": "source" },
  { "name": "inventory-only-production-path", "kind": "receipt", "value": "inventory-only" },
  { "name": "missing-behavioral-receipt-production-path", "kind": "receipt", "value": "missing" },
  { "name": "receipt-runner-digest-mutation", "kind": "receipt-field", "from": "\"runnerSha256\": \"4054c980bdc4134e15b3c7c3385d963426e50ac5658be2b93f409182d63f1d05\"", "to": "\"runnerSha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"", "reason": "behavioral execution receipt binding is invalid" },
  { "name": "receipt-terminal-result-mutation", "kind": "receipt-field", "from": "\"terminalSha256\": \"079380eccb5db41e4852d1634453d77641f375a40976a8e1dd9f00b64e1e8672\"", "to": "\"terminalSha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"", "reason": "actual diagnostic execution result does not match" },
  { "name": "receipt-closed-schema", "kind": "receipt-field", "from": "\"status\": \"PASS\"\n}\n```", "to": "\"status\": \"PASS\",\n  \"identity\": null\n}\n```", "reason": "behavioral execution receipt has unknown key" },
  { "name": "cmd-rm-forbidden-argv", "kind": "registry-field", "from": "[\"--diagnostic-op\", \"node-version\"]", "to": "[\"--diagnostic-op\", \"rm\"]", "reason": "diagnostic registry capability rejected" },
  { "name": "renamed-dangerous-id-build", "kind": "registry-field", "from": "\"action\": \"parse-tar\"", "to": "\"action\": \"build\"", "reason": "diagnostic registry capability rejected" },
  { "name": "renamed-dangerous-id-executable", "kind": "registry-field", "from": "\"executable\": \"node\"", "to": "\"executable\": \"rm\"", "reason": "diagnostic registry capability rejected" }
]
```
