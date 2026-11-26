# Token Radar baseline

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/taylorzy/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/taylorzy/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

For a local run with Node 22.18 or later, pass the input directory from the unpacked official kit. The competition harness supplies the same sealed input at /input.

```powershell
node main.ts --input path/to/token-radar-01-kit/input --output out
```

Open `out/dashboard/index.html` directly from disk. To repeat the determinism check on Node 26, run twice with `--permission --allow-fs-read=* --allow-fs-write=*` before `main.ts`, leaving network permission disabled. Compare relative filenames and SHA-256 hashes.

The official dev kit supplies the frozen input, starter, and dossier builder. The board includes the full watchlist plus up to 160 eligible below-floor protocols by TVL.

## Valuation

The estimate is the rounded value of `exp(intercept + slope * ln(TVL in USD))`, with a $1 minimum. The sealed snapshot supplies 119 non-CEX comparables with positive TVL and recorded market cap. The fit uses Huber loss with a threshold of 1.5 natural-log units and iteratively reweighted least squares. The full-sample intercept is 7.994604 and the slope is 0.464114. The original 25%-of-TVL formula with growth and listing-age modifiers remains in `impliedValue()` for comparison and fallback. Board rows keep the existing keys. For regression rows, `base_multiple` is the effective value-to-TVL ratio and both modifiers are 1.

Each leave-one-out fold excludes the evaluated slug before fitting or computing medians. The score is the mean absolute difference between predicted and observed natural-log market cap.

| Model | All 119 | Screened 106 | Screened training, all 119 evaluated |
| --- | ---: | ---: | ---: |
| Original baseline | 1.769 | 1.740 | 1.769 |
| Global median market-cap-to-TVL | 1.772 | 1.753 | 1.788 |
| Category median, global fallback for empty groups | 1.889 | 1.875 | 1.904 |
| Category median shrunk toward global median in log space, weight n/(n+10) | 1.786 | 1.785 | 1.821 |
| Huber log-log regression | 1.571 | 1.545 | 1.573 |

The sensitivity screen required a CoinGecko ID and ticker, excluded version suffixes in names, and excluded name or category matches for wrapped, bridged, staked, liquid staking, liquid restaking, or stablecoin. This screen is a proxy for questionable comparables. It moves the fitted slope from 0.464 to 0.447. Category results depend on the fallback and shrinkage definitions used above.

This is cross-sectional validation on recorded market caps. It does not measure historical launch prediction or account for launch timing, token supply design, or differences between already traded and pre-token protocols. Estimates outside the comparable TVL range extrapolate the fitted relationship.


The submission screenshots capture the generated ranked board, USDD's sourced detail with an illustrative cost scenario, and the board filtered to documented farming routes.

The original implementation session stays in the Codex session store. Keep it outside the source tree for later bundling with the official CLI.

## Token classification and candidate selection

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
