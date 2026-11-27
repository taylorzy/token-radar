# Token Radar V7 local review candidate

Open the generated dashboard in artifacts/v7/review/dashboard/index.html. The cover compares the submitted V6 default opportunity order with the V7 full-board order. Select a verdict to inspect the route evidence, change routes and test alternative exit scenarios. Local edits to assumptions take effect across the board when applied.

## Rebuild and verify

From the workspace root in cmd.exe:

```bat
node source\v7\main.ts --input research\baseline-input --output artifacts\v7\review
node source\v7\test-v7.mjs
```

The verifier compares all ranked fields except the revised farming instructions with the submitted V6 board, checks the official ledger, compares every profile with approved research, exercises route alternatives, reconstructs the dossier using the competition kit and compares a second clean build by SHA-256. Screenshots are fixed build inputs. capture-v7.mjs recreates them from the offline page using headless Edge.

## Scenario interpretation

The first approved path for each protocol is the initial comparison scenario. Alternative routes can be selected in Decision. Axis applies only to existing Origin holders. Its queue and instant exits carry different costs. Shift defaults to extUSD v1, Firelight to the shorter end of its exit range and CIAN to its guide estimate. A business-day estimate assumes a weekday request without an intervening holiday or weekend. Unsupported exit durations are excluded from modeled time and marked unpriced. Unknown variable fees retain the editable fee budget.

The $1,000 scenario assumes equal entry and exit notionals, zero realized trading profit and no wallet-specific reward entitlement. Points, yield and maker program rules are visible as evidence. They do not supply a dollar payout in the speculative token scenario. The existing global decision gates and stress-based sort determine opportunity rank. Prior-version tests with frozen V6 or earlier expectations are historical references.
