# M9 candidate-ranking comparison

V1 and the extended regularized fit with inner-selected penalty 100 rank the same 182 M8 candidates. Spearman is 0.999970 and Kendall tau-b is 0.998664. Top-10, Top-20, and Top-40 overlap are 10/10, 20/20, and 40/40. Only 19 candidates change ranks. These are model sensitivities. Ground-truth candidate market caps are unavailable.

| Candidate | V1 rank ? experimental | V1 value ? experimental | Growth factor | Age factor |
|---|---:|---:|---:|---:|
| shift-defi | 64 ? 61 | $10,846,580 ? $11,077,256 | 1.019473? | 1.001821? |
| august-digital | 92 ? 90 | $7,640,653 ? $7,678,134 | 1.003415? | 1.001539? |
| hive-protocol | 22 ? 23 | $21,057,128 ? $21,055,642 | 0.999964? | 1.000040? |
| current | 61 ? 62 | $11,059,161 ? $11,068,788 | 1.000063? | 1.000868? |
| project-0 | 62 ? 63 | $10,979,728 ? $10,986,051 | 0.999978? | 1.000659? |
| nuva | 113 ? 112 | $6,513,752 ? $6,558,304 | 1.005683? | 1.001200? |

Shift DeFi gains three ranks, the largest upward move. Its 4,448% seven-day growth and 45 tracking days increase its alternative fitted TVL component by about 1.95% and 0.18%, respectively. August Digital gains two ranks with growth +77.98% and 73 days. Nuva gains one rank and about 0.68% in implied value, with growth +160.80% and age 130 days. Growth can signal adoption, but a high percentage can also reflect a small starting base or short-lived inflow. The comparable growth range tops out near +2.69%, so all three movements extrapolate from traded peers. Tracking age can reflect coverage timing, and the weak negative fitted age term cannot establish a causal premium for youth.

The largest drop is one place, shared by hive-protocol, current, project-0, arrakis-modular, vfat.io, d2-finance, phoenix-perp, chain-fusion, 9summits, predict-fun, defa-by-invoicemate. Hive Protocol moves down because nearby R25 overtakes it, while its own growth and age factors nearly cancel. Current and Project 0 are displaced by Shift DeFi despite near-neutral or slightly positive own feature adjustments. Those moves reflect relative ordering of closely valued candidates, with no independent evidence that the new order is better.

## Mandatory watchlist

38 of 40 ranks are unchanged. R25 and Hive Protocol swap ranks 22 and 23. All 40 candidate comparisons are available in the JSON with the watchlist flag.

## Documented routes

All nine ranks are unchanged. Their valuations vary slightly.

| Candidate | V1 rank ? experimental | V1 value ? experimental | Growth factor | Age factor |
|---|---:|---:|---:|---:|
| steakhouse-financial | 2 ? 2 | $71,322,968 ? $71,362,512 | 1.000299? | 1.000355? |
| gauntlet | 3 ? 3 | $55,073,341 ? $55,122,355 | 1.000629? | 1.000355? |
| veda | 4 ? 4 | $54,841,588 ? $54,853,316 | 1.000043? | 1.000266? |
| usdd | 5 ? 5 | $45,706,793 ? $45,728,194 | 1.000274? | 1.000286? |
| upshift | 7 ? 7 | $32,281,632 ? $32,309,220 | 1.000741? | 1.000197? |
| onre | 10 ? 10 | $25,837,072 ? $25,856,091 | 1.000396? | 1.000419? |
| symbiotic | 14 ? 14 | $23,591,284 ? $23,588,338 | 0.999886? | 1.000066? |
| lightning-network | 18 ? 18 | $21,972,453 ? $21,970,034 | 0.999965? | 1.000000? |
| lofty | 36 ? 36 | $15,388,637 ? $15,389,474 | 1.000393? | 0.999730? |

## Evidence issues to revisit in M10

The snapshot does not carry parent protocol metadata, and null token fields are not proof of tokenlessness. Mezo Earn remains the classified related product required by the watchlist. Large weekly-growth observations such as Shift DeFi and Nuva should be checked for base effects or measurement changes before being treated as economic evidence. The sourced route summaries have not been refreshed during M9. Classifications and farming evidence were preserved as supplied by M8.
