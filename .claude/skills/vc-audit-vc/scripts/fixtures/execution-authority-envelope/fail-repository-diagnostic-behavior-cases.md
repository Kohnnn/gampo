# Fixture — Repository Diagnostic Behavior Negative Cases

Production behavior rejects discovered/default-empty runtime cleanup authority, stale pre-publication final summaries, and global cached/index reads. Positive controls require actual-creation runtime ledgers, one final cleanup publication attempt, exact twelve-path real-index intersections, or operation-owned alternate-index commands.

## Validate Contract

```json repository-diagnostic-behavior-negative-cases/v1
[
  { "name": "placeholder-source-production-path", "kind": "source" },
  { "name": "inventory-only-production-path", "kind": "receipt", "value": "inventory-only" },
  { "name": "missing-behavioral-receipt-production-path", "kind": "receipt", "value": "missing" },
  { "name": "receipt-runner-digest-mutation", "kind": "receipt-field", "from": "\"runnerSha256\": \"6bb7a4f4530f23fb2c34aab9c9154b3f27d211579a57f22a990069bc51033b25\"", "to": "\"runnerSha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"", "reason": "behavioral execution receipt binding is invalid" },
  { "name": "receipt-terminal-result-mutation", "kind": "receipt-field", "from": "\"terminalSha256\": \"079380eccb5db41e4852d1634453d77641f375a40976a8e1dd9f00b64e1e8672\"", "to": "\"terminalSha256\": \"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"", "reason": "actual diagnostic execution result does not match" },
  { "name": "receipt-closed-schema", "kind": "receipt-field", "from": "\"status\": \"PASS\"\n}\n```", "to": "\"status\": \"PASS\",\n  \"identity\": null\n}\n```", "reason": "behavioral execution receipt has unknown key" },
  { "name": "cmd-rm-forbidden-argv", "kind": "registry-field", "from": "[\"--diagnostic-op\", \"node-version\"]", "to": "[\"--diagnostic-op\", \"rm\"]", "reason": "diagnostic registry capability rejected" },
  { "name": "renamed-dangerous-id-build", "kind": "registry-field", "from": "\"action\": \"parse-tar\"", "to": "\"action\": \"build\"", "reason": "diagnostic registry capability rejected" },
  { "name": "renamed-dangerous-id-executable", "kind": "registry-field", "from": "\"executable\": \"node\"", "to": "\"executable\": \"rm\"", "reason": "diagnostic registry capability rejected" },
  { "name": "oracle-regression-envelope-only-root-mismatch", "kind": "oracle-regression", "value": "root-mismatch" },
  { "name": "oracle-regression-envelope-only-cleanup-leak", "kind": "oracle-regression", "value": "cleanup-leak" },
  { "name": "anti-cheat-git-positive-empty-buffer", "kind": "runner-self-check", "from": "const porcelainSpace = Buffer.from(\" M dir/file name\\\\0\");", "to": "const porcelainSpace = Buffer.alloc(0);" },
  { "name": "anti-cheat-git-parser-bypass", "kind": "runner-self-check", "from": "if (kind === \"git-porcelain-pathset/v1\") return { status: \"PASS\", records: parseGitPorcelainZ(out, err, parameters) };", "to": "if (kind === \"git-porcelain-pathset/v1\") return { status: \"PASS\", records: [] };" },
  { "name": "anti-cheat-git-type-change-status-omission", "kind": "runner-self-check", "from": "const GIT_PORCELAIN_STATUSES = [\" M\", \" T\", \" A\", \" D\", \" R\", \" C\", \"M \", \"MM\", \"MT\", \"MD\", \"T \", \"TM\", \"TT\", \"TD\", \"A \", \"AM\", \"AT\", \"AD\", \"D \", \"R \", \"RM\", \"RT\", \"RD\", \"C \", \"CM\", \"CT\", \"CD\", \"DD\", \"AU\", \"UD\", \"UA\", \"DU\", \"AA\", \"UU\", \"??\", \"!!\"];", "to": "const GIT_PORCELAIN_STATUSES = [\" M\", \" A\", \" D\", \" R\", \" C\", \"M \", \"MM\", \"MT\", \"MD\", \"T \", \"TM\", \"TT\", \"TD\", \"A \", \"AM\", \"AT\", \"AD\", \"D \", \"R \", \"RM\", \"RT\", \"RD\", \"C \", \"CM\", \"CT\", \"CD\", \"DD\", \"AU\", \"UD\", \"UA\", \"DU\", \"AA\", \"UU\", \"??\", \"!!\"];" },
  { "name": "anti-cheat-git-tree-utf8-terminator-omission", "kind": "runner-self-check", "from": "const invalidUtf8Tree = Buffer.concat([Buffer.from(`100644 blob ${oid}\\troot/`), Buffer.from([0xc3, 0x28, 0])]);", "to": "const invalidUtf8Tree = Buffer.concat([Buffer.from(`100644 blob ${oid}\\troot/`), Buffer.from([0xc3, 0x28])]);" }
]
```

```json repository-diagnostic-anti-cheat-cases/v1
[
  { "name": "anti-cheat-remove-shared-source-monitor" },
  { "name": "anti-cheat-hardcode-observed-counts" },
  { "name": "anti-cheat-remove-cleanup-static-gate" },
  { "name": "anti-cheat-git-positive-empty-buffer" },
  { "name": "anti-cheat-git-parser-bypass" },
  { "name": "anti-cheat-git-type-change-status-omission" },
  { "name": "anti-cheat-git-tree-utf8-terminator-omission" }
]
```
