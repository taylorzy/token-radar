# Token Radar V8 local review candidate

Open `artifacts/v8/review/dashboard/index.html` from the workspace. The initial board reads the submitted model's implied values in descending order. Opportunity Ranking uses the V7 decision engine and its editable assumptions. Screenshots and the dossier come from this local build.

## Review against the competition rubric

| Criterion | Evidence in V8 |
| --- | --- |
| Working radar | The first screenshot shows Sentora Curator at #1 ($75.6M), Steakhouse Financial at #2 ($73.8M), and Gauntlet at #3 ($58.1M). The offline browser test checks every displayed slug against the official order, including after returning from Opportunity Ranking. The ledger accounts for all 40 mandatory records. |
| Value model | Each row pairs its estimate with the empirical peer-error range and snapshot token classification. The formula disclosure and optional snapshot columns expose TVL, weekly growth and tracking age. The second screenshot shows held-out validation and comparative error. |
| Farm plans | Each evidence cell opens the protocol's participation research and execution steps. The fourth screenshot shows Lofty's documented 2.5% purchase fee, 3% sale fee and the requirement for a matching order to exit. Its expanded calculator shows the existing $1,000 example with $55.00 in fees, $4.11 in foregone return and $20.00 in labor, totaling $79.11. Multi-route records link to their route selector. |
| Usability | The third screenshot filters the board to 54 protocols with documented routes and pins Shift DeFi and USDD. Their official ranks remain visible across filters. The dedicated opportunity view retains assumptions, alternative exits, sensitivity analysis and global reranking. |
| Visual craft | Aligned dollar columns, a common scale for valuation bars and a separate range column make consecutive estimates comparable. The market chart expands on demand. Narrow screens use labeled two-column records. |

### Response to judge feedback

V7 opened with hypothetical opportunity economics. V8 opens with the requested valuation order and displays snapshot classification beside each estimate. The visible opportunity tab keeps the decision workflow one click away. In response to the preference for cleaner presentation, the board now puts comparison pins directly beside protocol names and reserves secondary model inputs and charts for deliberate inspection.

The evidence supports the requested order and product workflow. A remaining competitive limitation is the depth of available farming evidence. Sixty routes cover 54 protocols, and the other 128 rows carry conditional or research-only guidance. The model's wide empirical ranges and the five mandatory classification exceptions are visible. Visual preference and a future pairwise verdict remain untested.

## Rebuild and verify

From the Token Radar workspace root in cmd.exe, using Node 26:

```bat
node source\v8\main.ts --input research\baseline-input --output artifacts\v8\review
node source\v8\capture-v8.mjs "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" artifacts\v8\review source\v8\screenshots
node source\v8\main.ts --input research\baseline-input --output artifacts\v8\review
node source\v8\test-v8.mjs
```

The capture test runs Edge offline, checks the default and opportunity orders, filters, pinning, snapshot sorting, chart selection, route terms, scenario application and a 390-pixel viewport. Omit the last capture argument to exercise these interactions without writing images. The second build incorporates the captured images. The regression test compares V8 data against the submitted V7 output, exercises the engines with the same inputs, reconstructs the dossier using the level-58 kit and compares SHA-256 hashes against a separate clean build. The reviewed results are in `artifacts/v8/validation.json`.

## Scenario interpretation

The first approved path for each protocol is the initial comparison scenario. Alternative routes can be selected in Decision. Axis applies only to existing Origin holders. Its queue and instant exits carry different costs. Shift defaults to extUSD v1, Firelight to the shorter end of its exit range and CIAN to its guide estimate. A business-day estimate assumes a weekday request without an intervening holiday or weekend. Unsupported exit durations are excluded from modeled time and marked unpriced. Unknown variable fees retain the editable fee budget.

The $1,000 scenario assumes equal entry and exit notionals, zero realized trading profit and no wallet-specific reward entitlement. Points, yield and maker program rules are visible as evidence. They do not supply a dollar payout in the speculative token scenario. The existing global decision gates and stress-based sort determine opportunity rank. Prior-version tests with frozen V6 or earlier expectations are historical references.
