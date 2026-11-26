# M10 evidence and farming review

M10 starts from accepted M9 commit `e05586a4d130524a7cb210961c9560aff67b42e4`. The sealed snapshot is dated 2026-11-14. The targeted external review is dated 2026-11-26. The ledger preserves the raw token fields and keeps the external findings and links in a separate object. `Recorded token` retains its snapshot-specific meaning.

| Classification | M9 | M10 |
|---|---:|---:|
| Recorded token | 416 | 416 |
| Likely existing-token product | 5 | 7 |
| Related product | 19 | 21 |
| Uncertain | 137 | 137 |
| Pre-token candidate | 181 | 177 |
| Total | 758 | 758 |

- **USDD** is a deployed stablecoin according to its official contract listing. **Bittensor dTAO** is an aggregate mechanism for TAO and subnet alpha assets. Both move to likely existing-token product.
- **Lightning** uses Bitcoin payment channels. **Plume Vaults** is Plume's former Nest product and issues vault receipts. Both move to related product.
- **Mezo Earn** remains related. Direct official documentation confirms its relationship to Mezo, BTC, and MEZO. The snapshot bridge row is no longer used as the basis for this finding.
- **Sentora**, **Polymarket International**, **CIAN**, **Lagoon**, and **Nuva** retain their snapshot candidate classifications. The evidence clarifies curator, collateral, vault, or receipt relationships without proving the absence of a separate token.

All four classification changes are mandatory rows. The board remains 40 mandatory and 142 optional, with identical ranks and implied values across all 182 rows. The required board schema retains its original status field. The ledger and dashboard classification carry the external findings. The primary valuation, experimental comparator, uncertainty factor, and M9 evaluation artifacts were preserved.

## Route additions

| Route | What the official source supports | What to verify before committing principal |
|---|---|---|
| Sentora Curator | A named Tempo pathUSD Morpho vault, collateral context and Morpho share redemption | Exact vault, access, quotes and exit liquidity |
| CIAN Yield Layer | Approved deposit asset workflow, share receipt, redemption, and published fee structure | Current asset, caps, applicable fees, leverage and vault-specific withdrawal time |
| Plume Vaults | Stablecoin-to-vault-share entry and instant or queued redemption | Vault eligibility, fees, wait window and underlying liquidity |
| Lagoon | Asynchronous deposit and redemption requests with settlement and share or asset claims | Vault asset, permissions, curator, fees and settlement schedule |
| Nuva | Ethereum USDC entry into nvYLDS and a USDC withdrawal workflow | Current minimum, screening, location terms, quotes and redemption liquidity |

The prior nine routes and their farming steps match M9. The five new route profiles record sources, capital requirements, fee mechanisms, settlement expectations, and specific risks. Existing review and handling times are explicitly planning estimates. A documented action or product point does not verify an airdrop, eligibility, or payout.

## Economics and verification

The default machine-readable farming file contains all 182 ranked slugs and leaves user quotes and calculated outputs null. A per-slug assumptions file can populate the machine summary and prefill the offline calculator. The required reward is fees plus simple foregone return plus labor. Required reward per hour divides by active labor hours when positive. The verdict compares a user-entered hypothetical reward with that threshold. Principal, costs and hypothetical reward remain separate. The calculation excludes asset gains or losses and taxes.

Five regression tests passed, including valid and invalid scenario input, zero labor, arithmetic overflow, classification priority, damaged-ledger rejection, calculator behavior, and route filtering in the browser. Two offline builds produced 12 byte-identical output files. The M10 LCOV file includes all nine authored executable production files. JS/TS coverage is 1,373/1,388 lines (98.92%), 525/594 branches (88.38%), and 166/167 functions (99.40%). Relative to M9, that is +0.32, +1.46, and +0.03 percentage points. The build tests do not exercise every CLI packaging failure or legacy dialog fallback.

## Remaining gaps

The sealed dataset omits DefiLlama's parent field. External product relationships establish what the official documents describe and may not resolve DefiLlama's parent assignment or historical product status. The review did not find an authoritative explanation for the extreme Shift DeFi or Nuva growth readings, and their snapshot figures were retained. The remaining 137 uncertain rows were not reclassified without direct evidence. Live quote, access, location and settlement terms remain product and account dependent. No route was transacted. Screenshots, transcript checks and the official submission check are reserved for M11.

See [machine-readable results](m10-results.json), [coverage](coverage/m10.lcov), and the [evidence registry](../lib/protocol-evidence.json).
