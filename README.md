# Token Radar baseline

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taylorzy/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taylorzy/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

For a local run with Node 22.18 or later, pass the input directory from the unpacked official kit. The competition harness supplies the same sealed input at /input.

```powershell
node main.ts --input path/to/token-radar-01-kit/input --output out
```

Open `out/dashboard/index.html` directly from disk. To repeat the determinism check on Node 26, run twice with `--permission --allow-fs-read=* --allow-fs-write=*` before `main.ts`, leaving network permission disabled. Compare relative filenames and SHA-256 hashes.

The official dev kit supplies the frozen input, starter, and dossier builder. The M8 board includes the full watchlist and all optional records that pass the candidate screen.

## M7.1 regularization and M8 coverage

The primary model uses the M7 transforms and a Huber loss with selective L2 regularization on the standardized growth and tracking-age slopes. The intercept and TVL slope are unpenalized. The bounded penalty grid was 0, 0.1, and 1, on average Huber loss plus half the penalty times the squared standardized slopes. Selection used four deterministic, slug-interleaved inner folds within each outer training set. Every inner and outer fit estimated preprocessing from its own training rows. Penalty 1 was selected in every outer fold and on the full sample. The fixed-penalty rows below are diagnostics; the nested row measures the selection procedure.

| Model | Leave-one-out | Held-out age cohorts |
| --- | ---: | ---: |
| Original starter | 1.768855 | 1.768855 |
| V1 TVL Huber | 1.571354 | 1.563690 |
| M7 unregularized | 1.604269 | 1.634246 |
| Penalty 0.1 | 1.596637 | 1.613466 |
| Penalty 1 / nested selection | 1.579726 | 1.579451 |

The regularized fit improves on M7 in both tests and still trails V1. Its centered intercept is 15.937034 and its TVL, growth and age coefficients are +0.463313, +0.237691 and ?0.041556. For Nuva, growth and age multiply the fitted TVL component by 1.377 and 1.088. All three inputs contribute to the primary ranking.

The ledger `protocol-accounting.json` reconciles every input slug. It preserves the classification evidence, board rank or null, mandatory watchlist flag, and disposition. Counts are 416 recorded tokens, 5 likely existing-token products, 19 related products, 137 uncertain records, and 181 candidate records. The kit explicitly identifies USDT0 as a product of an already traded token. We use that evidence to move it from uncertain to likely existing-token product.

The kit permits additions on either side of the TVL floor. The board keeps all 40 required rows, including the one related product on the official watchlist. It ranks all 142 optional candidates supported by the snapshot screens, up from 106. It adds 16 below-floor and 20 at-or-above-floor protocols and excludes 54 formerly ranked related or uncertain rows from the optional pool. Their evidence remains in the ledger. This yields 182 ranked rows and 576 excluded records. A snapshot candidate means no recorded token and no disqualifying evidence from these screens. It does not establish current token status. All nine documented farming routes remain on the board.

The detail drawer shows a peer-error range based on the 80th percentile of 119 absolute log residuals from nested leave-one-out predictions. Divide and multiply the point estimate by 12.471. This is a descriptive range from held-out traded peers. Coverage on pre-token protocols or future launches is unknown. The width reflects the dispersion observed in the validation sample.

Reproduce the combined review from the worktree:

```powershell
node validate-valuation.ts <kit-input/snapshot.json> ../token-radar-m6/node22-output/board.json ../token-radar-m7-review/board.json
```

## Previous M7 baseline

The M7 baseline board uses a Huber fit of natural-log recorded market cap on three centered features. The fit uses the same 119 non-CEX peers with positive TVL and market cap as V1, and the same Huber threshold of 1.5 log units. It estimates all coefficients from the data. Each term is the coefficient times the transformed input minus its training median, with the subtraction performed before multiplication. Add the terms to the intercept, exponentiate, and round to the nearest dollar with a $1 floor.

| Input | Transform | Training median | Coefficient |
| --- | --- | ---: | ---: |
| TVL | ln(TVL in USD) | 17.120825 | +0.460296 |
| Seven-day growth | asinh(growth percent / 100) | -0.093047 | +0.401868 |
| Protocol age | ln(1 + tracking days) | 6.898715 | -0.151665 |

The centered intercept is 15.929800. Missing inputs use their training medians, giving a neutral contribution. Age is days since DefiLlama began tracking the protocol. For pre-token candidates this is a proxy for tokenless age. The snapshot supplies neither a verified protocol inception date nor historical token status. Of the comparable rows, 32 lack tracking age and all have growth. On the 200-row board, 28 have growth and 20 have age outside the corresponding observed training range. The fitted negative age coefficient is a conditional association in these data.

### Validation

Mean absolute log error on the same 119 observations in each column. Lower is better. Each fold fits the models and estimates preprocessing exclusively on training rows. Every peer is evaluated once per method. The second method holds out one complete cohort at a time: 32 with unknown age and three known-age cohorts of 29, divided at 660 and 1,249 tracking days. Both methods measure cross-sectional market-cap error on traded peers. The age-cohort test measures generalization across tracking-age groups on one snapshot.

| Model | Leave-one-out | Held-out age cohorts |
| --- | ---: | ---: |
| Original starter | 1.768855 | 1.768855 |
| V1 TVL-only Huber | **1.571354** | **1.563690** |
| M7 full Huber | 1.604269 | 1.634246 |
| M7 without TVL | 1.750824 | 1.821946 |
| M7 without growth | 1.583751 | 1.623075 |
| M7 without age | 1.584287 | 1.565634 |

Removing TVL increases error by 0.147 and 0.188 respectively. Removing growth reduces error by 0.021 and 0.011. Removing age reduces error by 0.020 and 0.069. The full model improves over the starter but is worse than V1 by 0.033 and 0.071 log units. This snapshot supports retaining V1 as the better validated baseline. M7 remains the three-input candidate for review.

### Example board changes

Rank 1 is highest. Multipliers show the fitted contribution relative to the training median while holding the other terms fixed.

| Protocol | Rank V1 ? M7 | Implied value V1 ? M7 | Growth factor | Age factor |
| --- | ---: | ---: | ---: | ---: |
| Monolith Market | 195 ? 80 | $4.50M ? $9.90M | 1.725 | 1.283 |
| Nuva | 129 ? 35 | $6.51M ? $15.08M | 1.718 | 1.359 |
| Origami Finance | 69 ? 117 | $8.60M ? $8.00M | 0.930 | 1.012 |
| Anemoy Capital | 74 ? 145 | $8.47M ? $6.98M | 0.792 | 1.053 |

The screenshots in this review worktree are carried over from V1 and do not depict the updated rankings.

## Historical V1 classification and candidate selection

All 758 sealed records are classified. Any populated token field is recorded-token evidence. Empty fields establish only that the snapshot lacks a token record. The classification uses named record pairs for reviewed cases, the kit guide for two documented wrappers, and conservative name, category, and chain signals. The seven investigated family prefixes require another record with the same prefix and a shared deployment chain. A family link is a lead for review and does not establish a common issuer or underlying asset. Version-stripped matches are also treated as evidence for review.

| Classification | Full snapshot | Previous board under new rules | Updated board |
| --- | ---: | ---: | ---: |
| Recorded token | 416 | 0 | 0 |
| Likely existing-token product | 4 | 2 | 0 |
| Related product | 19 | 19 | 19 |
| Uncertain | 138 | 35 | 36 |
| Pre-token candidate | 181 | 144 | 145 |

The previous policy found 342 records with all three token fields null and 289 after the CEX and version screens. The board still includes all 40 official watchlist rows and up to 160 below-floor rows selected by TVL before ranking by implied value. Within that below-floor pool, the Polygon zkEVM Bridge and GMX Solana records are now excluded based on matching branded product functions and token-bearing peers. Hertzflow and Prime Staking fill the open slots. Mezo Earn remains on the watchlist, with its Mezo Bridge relationship flagged. Starknet BTC Staking and Manta CeDeFi remain uncertain. Mantle Restaking, Kava Mint and MetalX Swap have related records with separate product functions. The dashboard shows the reason and peer identifiers in row details. The official board schema retains its original token-status field.

The 63 preliminary candidates at or above $50 million outside the official watchlist include 18 liquid-staking, 15 bridge and 8 canonical-bridge records. The audit classified 41 as uncertain, 2 as likely existing-token products and 20 as candidates. The kit specifically identifies WBTC and Binance Staked ETH as products of existing assets. The sealed file omits the parent-protocol field used to generate the official watchlist, so the precise omission reasons for individual remaining records cannot always be established. Above-floor non-watchlist records remain outside this board.

## Farming evidence and economics

The kit permits URLs as visible text and prohibits remote references in dashboard attributes, CSS and JavaScript module specifiers. The nine sourced route summaries are bundled in dashboard/farming-routes.json. The sealed input is unchanged. The generated dashboard uses the same farm steps as board.json.

Documented route means the cited material describes the product operation. Confirm current product terms, costs and access before funding. Conditional routes are category-based checks that require verification. Research-only plans stop before funding. Working times and zero-transaction research budgets are planning assumptions. Actual fees, settlement time and airdrop eligibility remain unknown unless independently verified.

The calculator uses total cash fees plus capital times annual opportunity-cost rate times days divided by 365, plus labor hours times hourly value. Its placeholders are examples, and calculations require explicit inputs. Break-even excludes taxes and protocol gains or losses. Committed principal is shown separately.
