# Jev + Mercury 2.5 - board v1.2

Two completed cohorts, each with 49 tasks and three attempts per task. No follow-up A/B/C experiments are included. Existing task definitions, scores, and the 600-second attempt cap are unchanged.

| Setup | Version | Tasks solved | Attempts passed | Median agent time | Median cost |
|---|---|---:|---:|---:|---:|
| WebMCP | `decision-scaffold-v5-mercury-readiness-v1` | 49/49 | 141/147 | 3.210s | $0.001063960 |
| DOM (ultrafast), no WebMCP | `ultrafast-windtunnel-v2` | 25/49 | 76/147 | 5.385s | $0.000777958 |

Jev (`jev-1.13.0`) selects actions. Mercury (`mercury-2.5`, instant) writes arguments or field values and the final answer. The page runner uses the frozen ultrafast implementation; it does not use WebMCP. These are complete setups with different harnesses, not an isolated interface ablation. The recorded model snapshots are fixed across both cohorts.

## Accounting

| Setup | Scored attempts, known cost | All requests, known cost | Unknown-usage reserve |
|---|---:|---:|---:|
| WebMCP | $0.201557376 | $0.202240636 | $0.014364710 |
| DOM (ultrafast) | $0.245387386 | $0.245579494 | $0.003151620 |

Leaderboard costs use reported token usage at standard estimated prices. Unknown usage is not zero cost: reserves above are separate from leaderboard medians. Infrastructure recovery requests are excluded from scored attempts but included in total accounting. Terminal refusals, content filters, turn limits, and agent failures remain scored failures. Cost and time medians include failed attempts.

## Source and publication

- WebMCP configuration SHA-256: `8cde0637d5e1c4edb27d0d83497d2e38571bda0c2e0bbd568751f75178fa54bd`.
- Page configuration SHA-256: `35271c3b2ed88df7216f7d9074ed18d75ed420862382bf25169da455afb9e5bb`.
- Ultrafast upstream revision: `452c1ad2dd628008f1d5608f28158d76e49e6cc0`.
- `scripts/publish-jev-results.mjs` checks completed cohorts, checkpoint checksums, configuration hashes, task hashes, versions, and 49 complete three-attempt cells before exporting.

`run.json` and `results.csv` contain measurements and redacted final answers. Browser traces, credentials, private paths, runtime configuration, and working documents are omitted. The canonical task copy is sanitized for the explorer and dataset; executed task definitions are unchanged. These artifacts support metric and answer-score verification, not full trace audits. The experimental runners are not shipped in the standard benchmark CLI.
