# M9 model evaluation and selection

**Decision: restore V1 TVL-only Huber as primary over the M8 candidate universe.** Estimate USD market cap as rounded `exp(7.994604 + 0.464114 ? ln(TVL USD))`; the runtime uses full-precision fitted coefficients and a $1 floor. Keep the expanded-grid regularized Huber and starter as detail comparators. Growth and tracking age remain visible.

V1 has the lowest mean absolute log error in both schemes. Several richer models have lower median error but higher mean error, especially the age model in held-out cohorts. The starter has the highest pooled rank correlations with observed caps in both schemes, but substantially worse mean and median valuation error and no gain on pooled top-k overlap. The extended regularized model has effectively the same ranking performance as V1, with a small Kendall gain in leave-one-out and small correlation losses in both other comparisons. No alternative consistently improves accuracy and ranking. The paired uncertainty ranges include zero, so these data do not establish a statistically reliable difference from V1. With near-zero fitted growth and age effects at the selected penalty, V1 is easier to explain without giving up a demonstrated improvement.

## Evaluation design

All models use the same 119 traded peers as M7. No peers were removed. Targets are recorded USD market caps from one sealed snapshot. Absolute log errors use whole-dollar predictions with a $1 floor. Spearman uses average ranks for ties. Kendall uses tau-b. Top-k is intersection count, with slugs breaking value ties. Percentiles in the error tables use linear interpolation.

The leave-one-out test trains on 118 peers per fold. The age-cohort test holds out the 32 missing-age records as a group and each of three known-age groups (29 each) divided at 660 and 1,249 days. Pooled metrics compare predictions across different outer fits. Cohort tables compare rankings within a single held-out group. Top 40 is unavailable in every cohort. This is cross-sectional traded-peer evaluation. Tracking age measures time since DefiLlama began tracking the protocol and does not establish historical tokenless age or launch valuation.

All fitted variants use Huber loss with a threshold of 1.5 natural-log units. Transforms are ln(TVL USD), asinh(seven-day growth percent / 100), and ln(1 + tracking days). For the multivariate solver, each transformed variable is centered on its training median and divided by the root mean squared deviation from that median, calculated over observed training values. Missing values map to the median. The objective is mean Huber loss plus ?/2 times the sum of squared standardized growth and age slopes. TVL and the intercept are unpenalized. Coefficients reported below are in transformed input units before rescaling.

The M7.1 comparator repeats inner selection with [0, 0.1, 1]. M9 uses [0, 0.1, 1, 3, 10, 30, 100]. Both use four slug-interleaved folds restricted to each outer training set, minimizing mean absolute log error on unrounded inner predictions and breaking exact ties toward the smaller penalty. All preprocessing is refit within every training fold. The final experimental fit selects its penalty with the same inner procedure on the full peer set. Outer scores did not choose the penalty.

## Leave-one-out, pooled

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 1.7689 | 1.6561 | 2.5215 | 0.4068 | 0.2853 | 3/7/20 |
| V1 TVL Huber | 1.5714 | 1.2465 | 2.5233 | 0.3734 | 0.2608 | 3/7/20 |
| TVL + growth | 1.5843 | 1.2260 | 2.5261 | 0.3519 | 0.2434 | 3/7/20 |
| TVL + age | 1.5838 | 1.2182 | 2.5644 | 0.3529 | 0.2423 | 3/6/20 |
| M7 full | 1.6043 | 1.2274 | 2.5688 | 0.3157 | 0.2164 | 3/6/19 |
| M7.1 nested | 1.5797 | 1.2254 | 2.5159 | 0.3574 | 0.2488 | 3/7/20 |
| M9 extended nested | 1.5726 | 1.2461 | 2.5232 | 0.3729 | 0.2611 | 3/7/20 |

## Held-out age cohorts, pooled

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 1.7689 | 1.6561 | 2.5215 | 0.4068 | 0.2853 | 3/7/20 |
| V1 TVL Huber | 1.5637 | 1.2421 | 2.4988 | 0.3797 | 0.2656 | 3/7/20 |
| TVL + growth | 1.5656 | 1.1897 | 2.5010 | 0.3700 | 0.2596 | 3/7/20 |
| TVL + age | 1.6231 | 1.1661 | 2.7692 | 0.2712 | 0.1881 | 3/7/19 |
| M7 full | 1.6342 | 1.1669 | 2.7711 | 0.2496 | 0.1719 | 3/7/19 |
| M7.1 nested | 1.5795 | 1.1874 | 2.6075 | 0.3550 | 0.2465 | 3/7/19 |
| M9 extended nested | 1.5638 | 1.2421 | 2.4976 | 0.3792 | 0.2653 | 3/7/20 |

## Within-cohort metrics

### Unknown age (32 peers)

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 2.0947 | 1.9597 | 2.8923 | 0.5095 | 0.3871 | 6/15/? |
| V1 TVL Huber | 1.9744 | 1.5659 | 2.8047 | 0.5176 | 0.3911 | 6/15/? |
| TVL + growth | 1.9873 | 1.6420 | 2.7800 | 0.4549 | 0.3266 | 5/15/? |
| TVL + age | 1.9758 | 1.5579 | 2.8522 | 0.5176 | 0.3911 | 6/15/? |
| M7 full | 1.9866 | 1.6350 | 2.7865 | 0.4564 | 0.3266 | 5/15/? |
| M7.1 nested | 1.9791 | 1.5997 | 2.7977 | 0.4879 | 0.3669 | 5/15/? |
| M9 extended nested | 1.9745 | 1.5665 | 2.8046 | 0.5176 | 0.3911 | 6/15/? |

### Under 660 days (29 peers)

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 1.9754 | 1.6561 | 2.8570 | 0.2217 | 0.1527 | 4/17/? |
| V1 TVL Huber | 1.6330 | 0.9533 | 2.4150 | 0.2197 | 0.1527 | 5/16/? |
| TVL + growth | 1.6242 | 0.9164 | 2.4425 | 0.2286 | 0.1626 | 5/17/? |
| TVL + age | 1.8865 | 1.1661 | 3.1430 | 0.2079 | 0.1232 | 4/16/? |
| M7 full | 1.9096 | 1.2131 | 3.2137 | 0.2059 | 0.1330 | 4/16/? |
| M7.1 nested | 1.6943 | 1.1120 | 2.5802 | 0.2079 | 0.1527 | 4/17/? |
| M9 extended nested | 1.6335 | 0.9555 | 2.4192 | 0.2246 | 0.1576 | 5/17/? |

### 660 to 1,248 days (29 peers)

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 1.4659 | 1.4389 | 2.4135 | 0.4222 | 0.3103 | 5/16/? |
| V1 TVL Huber | 1.3351 | 0.9285 | 2.3316 | 0.4232 | 0.3054 | 5/16/? |
| TVL + growth | 1.3330 | 0.9350 | 2.3260 | 0.4286 | 0.3103 | 5/16/? |
| TVL + age | 1.3313 | 0.9199 | 2.3232 | 0.4044 | 0.2857 | 5/15/? |
| M7 full | 1.3337 | 0.9133 | 2.3280 | 0.4044 | 0.2906 | 5/15/? |
| M7.1 nested | 1.3336 | 0.9275 | 2.3286 | 0.4291 | 0.3103 | 5/16/? |
| M9 extended nested | 1.3351 | 0.9285 | 2.3316 | 0.4232 | 0.3054 | 5/16/? |

### At least 1,249 days (29 peers)

| Model | MA log error | Median | P80 | Spearman | Kendall tau-b | Top 10/20/40 |
|---|---:|---:|---:|---:|---:|---:|
| Starter | 1.5058 | 1.5446 | 2.0721 | 0.3798 | 0.2808 | 4/15/? |
| V1 TVL Huber | 1.2698 | 1.1726 | 1.8150 | 0.3704 | 0.2709 | 4/15/? |
| TVL + growth | 1.2744 | 1.1897 | 1.8214 | 0.3507 | 0.2562 | 4/15/? |
| TVL + age | 1.2621 | 0.9973 | 1.9142 | 0.3640 | 0.2709 | 4/15/? |
| M7 full | 1.2706 | 0.9626 | 1.9176 | 0.3443 | 0.2414 | 4/15/? |
| M7.1 nested | 1.2695 | 1.1482 | 1.8785 | 0.3527 | 0.2562 | 4/15/? |
| M9 extended nested | 1.2697 | 1.1720 | 1.8158 | 0.3704 | 0.2709 | 4/15/? |

## Paired uncertainty

Differences are model minus V1 absolute log loss on the same held-out records. Intervals are approximate 95% corrected-resampled t intervals: the standard error uses sample variance of the outer fold mean differences times (1 / fold count + mean test/train ratio). The center is the pooled per-peer difference; fold sizes are nearly balanced in the cohort test. Overlapping training sets make prediction errors dependent. The correction is heuristic here, particularly for leave-one-out and with only four structured cohorts. The intervals do not capture snapshot-to-snapshot or token-launch uncertainty.

| Model | Leave-one-out difference [interval] | Age-cohort difference [interval] |
|---|---:|---:|
| Starter | +0.19750 [-0.02582, +0.42082] | +0.20516 [-0.04798, +0.45831] |
| TVL + growth | +0.01293 [-0.00593, +0.03179] | +0.00194 [-0.02062, +0.02451] |
| TVL + age | +0.01240 [-0.02029, +0.04509] | +0.05938 [-0.25303, +0.37180] |
| M7 full | +0.03292 [-0.01269, +0.07852] | +0.07056 [-0.26141, +0.40252] |
| M7.1 nested | +0.00837 [-0.00420, +0.02095] | +0.01576 [-0.05795, +0.08947] |
| M9 extended nested | +0.00121 [-0.00118, +0.00360] | +0.00013 [-0.00052, +0.00078] |

## Penalty selection and stability

| Outer scheme | M7.1 counts | Extended counts |
|---|---|---|
| Leave-one-out | 1: 119 | 1: 1, 3: 1, 10: 3, 30: 2, 100: 112 |
| Age cohorts | 1: 4 | 100: 4 |

The full peer set also selected 100. It remains a boundary result, consistent with the additional terms adding little signal. The requested search stops here.

| Fit and scheme | Term | Minimum | Median | Maximum | Positive folds |
|---|---|---:|---:|---:|---:|
| V1 TVL Huber / loo | tvl | 0.439811 | 0.464223 | 0.500885 | 119 |
| M7.1 nested / loo | tvl | 0.438705 | 0.463403 | 0.499835 | 119 |
| M7.1 nested / loo | growth | -0.343040 | 0.236827 | 0.759788 | 118 |
| M7.1 nested / loo | age | -0.101700 | -0.041268 | -0.012764 | 0 |
| M9 extended nested / loo | tvl | 0.439797 | 0.464214 | 0.500871 | 119 |
| M9 extended nested / loo | growth | -0.004041 | 0.004173 | 0.395121 | 118 |
| M9 extended nested / loo | age | -0.039512 | -0.000592 | -0.000229 | 0 |
| V1 TVL Huber / age | tvl | 0.410887 | 0.458516 | 0.518369 | 4 |
| M7.1 nested / age | tvl | 0.408056 | 0.456275 | 0.520074 | 4 |
| M7.1 nested / age | growth | -0.166516 | 0.183368 | 0.672018 | 3 |
| M7.1 nested / age | age | -0.062383 | -0.051140 | 0.174952 | 1 |
| M9 extended nested / age | tvl | 0.410840 | 0.458487 | 0.518393 | 4 |
| M9 extended nested / age | growth | -0.002087 | 0.002918 | 0.011135 | 3 |
| M9 extended nested / age | age | -0.000925 | -0.000713 | 0.002414 | 1 |

The final extended slopes were 0.464104 (TVL), 0.004209 (growth), and ?0.000593 (age). Growth changes sign in both schemes, and age changes sign in the cohort scheme. The primary V1 model has an empirical multiplicative range of ?12.4886 to ?12.4886, recalibrated using the nearest-rank 80th percentile of 119 V1 leave-one-out absolute log residuals. This descriptive peer-error range has unknown coverage for pre-token valuations or future launches.

Machine-readable predictions, cohort metrics, paired differences, coefficient summaries, and candidate rows are in [m9-evaluation.json](m9-evaluation.json).
