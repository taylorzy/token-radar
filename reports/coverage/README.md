# Authored production test coverage

The same offline test workload ran against archived V1, M7, and M8 sources and the M9 worktree. Node 26.13.1 V8 coverage includes the CLI and TypeScript modules. Edge DevTools precise coverage supplies dashboard JavaScript ranges to the same Node reporter. Branch counts are V8 block-range coverage, which can differ from AST-based tools. The runner enables inclusion of unloaded production sources and asserts that the LCOV inventory matches the full production source list. In this run every production file had coverage data.

The denominator contains the authored executable radar code: main.ts, lib/*.ts, and dashboard/app.js. Static markup, styles, data, generated outputs, vendored code, offline analysis scripts and test tooling are outside the measured executable production artifact. All four radar revisions contain zero authored production Python files; separate leaderboard collectors are outside these revisions. Deltas below are percentage points from the preceding version. The JSON also gives deltas from V1.

| Version | Lines | Branches | Functions | Python |
|---|---:|---:|---:|---|
| V1 | 1079/1096 (98.45%) | 362/417 (86.81%) | 109/110 (99.09%) | N/A (0 files) |
| M7 | 1176/1193 (98.58%) [+0.13 pp] | 426/489 (87.12%) [+0.31 pp] | 138/139 (99.28%) [+0.19 pp] | N/A (0 files) |
| M8 | 1258/1276 (98.59%) [+0.01 pp] | 466/537 (86.78%) [-0.34 pp] | 160/161 (99.38%) [+0.10 pp] | N/A (0 files) |
| M9 | 1263/1281 (98.59%) [+0.01 pp] | 472/543 (86.92%) [+0.15 pp] | 158/159 (99.37%) [-0.01 pp] | N/A (0 files) |

## M9 by source file

| File | Lines | Branches | Functions |
|---|---:|---:|---:|
| dashboard/app.js | 448/456 (98.25%) | 164/212 (77.36%) | 56/57 (98.25%) |
| lib/classification.ts | 92/92 (100.00%) | 41/42 (97.62%) | 8/8 (100.00%) |
| lib/farming.ts | 48/48 (100.00%) | 23/23 (100.00%) | 2/2 (100.00%) |
| lib/ledger.ts | 30/31 (96.77%) | 22/24 (91.67%) | 10/10 (100.00%) |
| lib/model.ts | 415/415 (100.00%) | 120/127 (94.49%) | 37/37 (100.00%) |
| lib/regularization.ts | 26/26 (100.00%) | 10/13 (76.92%) | 6/6 (100.00%) |
| lib/valuation.ts | 119/119 (100.00%) | 86/89 (96.63%) | 36/36 (100.00%) |
| main.ts | 85/94 (90.43%) | 6/13 (46.15%) | 3/3 (100.00%) |

The aggregate 90% line and 80% branch targets were met. Individual files with lower branch coverage include the dashboard, regularization selection, and the CLI. Tests cover rank and snapshot rejection, missing feature values, degenerate fits, token and family classification, farming route classes, positive and invalid calculator inputs, filtering, sorting, and detail deep links. Remaining gaps include calculator overflow, dialog fallback on older browsers, degenerate inner selection or convergence failures, ledger corruption rejection, and failing screenshot packaging or CLI deck generation. Those paths lack direct end-to-end exercise here. No source lines were removed or marked ignored for coverage.

Raw per-version LCOV and machine-readable counts are in the baseline commits and release QA archive. Reproduce with measure-coverage.ps1 and then node summarize-coverage.mjs.
