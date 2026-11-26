# V4 research record

The November 14, 2026 snapshot remains the valuation input. Seven specifications and five whole-board counterfactuals share the same candidate universe. Their spread measures dependence on modeling choices. Uniform TVL shocks can move values substantially while preserving ranks. Shift DeFi moves from $36.5M at rank 7 to $12.3M at rank 56 under peer-median growth. The growth-only addition to TVL gives $369.8M and the TVL-only fit gives $10.8M.

## Interval experiment

Five family-held-out rotations use disjoint fit, calibration and evaluation groups, with the fixed V3 penalty. Alongside the local neighbor method we tested one additional scale, mean absolute training residual by above/below training median TVL, shrunk with ten global pseudo-observations. Both use a global fallback for weak support. The global split comparator covered 96 of 119, versus 95 for each adaptive method. Mean log widths were 5.357 (global), 5.311 (neighbors), and 5.327 (TVL strata). Interval scores were 7.955, 8.042 and 7.897 respectively. The small score advantage for size came with one extra miss. We retained V3's full-fit empirical range. Its construction differs from the split comparator. Local residuals describe training peers and are optimistic measures of individual error. Subgroup counts and metrics are exported in model-intelligence.json.

## Token labels and use

402 recorded tokens and 177 screened candidates form 450 inferred families. A negative means no recorded token after screening. Aliases may survive grouping, and common brands or symbols may overmerge. Classification uses dated external evidence to screen ambiguous identities. The design matrix uses snapshot features exclusively. Ridge scores for candidates exclude their own fold, including their known label and inferred relatives. A pooled intercept AUC can differ from 0.5 because training prevalence varies between folds. Model choice used pooled held-out results. Calibration is uneven, especially at predicted 0.4 to 0.6 (76 records averaging 0.517 predicted and 0.289 observed). The score is suitable for exploratory ordering, not a launch forecast.

The evidence-conditioned opportunity screen requires both an eligible standalone candidate and an independently documented participation route. It retains 11 of 14 routes, orders qualifying candidates by consensus times cross-sectional propensity, and leaves the estimated propensity untouched. The route demonstrates an available action only. The calculator separately prices participation under user-supplied assumptions.

## Historical feasibility

Public DeFiLlama histories for Shift DeFi, Nuva and Sentora Curator yielded 66, 144 and 428 TVL observations in the earlier probe. For an independent as-of cohort check, the last public DefiLlama-Adapters commit before November 1, 2025 contained 5,988 projects/<directory>/index.js paths. None of the three snapshot slugs matched a project directory exactly. Adapter existence can anchor tracking activity, but reconstructing token outcomes requires timestamped issuance evidence, stable identity resolution, historical negatives and observation through the horizon including delisted protocols. This probe did not establish those prerequisites. First price is an incomplete proxy for issuance. We include no third-party history or adapter code and make no redistribution-license assumption. Historical collection and out-of-time evaluation remain open.

[Archived adapter tree](https://github.com/DefiLlama/DefiLlama-Adapters/tree/ecbc53e55bb92fa05fb3340cd18715b155fb9b6b/projects)
