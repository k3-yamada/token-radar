# radar-19 leave-one-out contests

Snapshot: `/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json` (128 live peers). Measurements from `node tools/loo-contests.mjs <snapshot.json>`; all calibration is repeated after leaving out each peer. No variant was adopted.

## Contest S: calibration basis consistency

| Arm | Coverage | Median log error | Median absolute log error | Category MAE | Global-anchored MAE |
|---|---:|---:|---:|---:|---:|
| S0 current | 0.5000 | -0.000000024 | 1.23736 | 1.56092 | 1.74808 |
| S1 adjusted global | 0.5000 | 0.000000012 | 1.33296 | 1.55091 | 1.75004 |

Per-basis median log error / median absolute log error (S0 → S1): category `0.04777 / 1.20193` → `0.00000 / 1.19266`; global-anchored `-0.31560 / 1.34660` → `-0.15115 / 1.41608`. MAE is mean absolute log error.

## Contest G: sparse category band basis continuity

| Arm | Overall coverage | Median log error | Median absolute log error | Sparse coverage (n=17) | Sparse mean band ratio | Rows with changed band basis |
|---|---:|---:|---:|---:|---:|---:|
| G0 current | 0.5000 | -0.000000024 | 1.23736 | 0.5294 | 11.7652 | 0 |
| G1 w < 0.5 uses global anchored | 0.5078 | -0.000000024 | 1.23736 | 0.5882 | 13.8083 | 17 |
| G2 quantiles interpolated by w | 0.4844 | -0.000000024 | 1.23736 | 0.5882 | 13.4347 | 100 |

Point estimates and log errors are identical across G arms. Sparse rows have 2–4 remaining live category peers in the LOO calibration. G2's changed count is the number of category rows with `w < 1` whose band uses interpolated quantiles.

# radar-20 contests (corrected normalization)

Same snapshot, 128 live peers. Measurements from `node --experimental-strip-types tools/radar20-contests.mjs <snapshot.json>` (about 3 minutes). All arms use the production settings: G2/M1 factors, full-sample size slope −0.5951 with the centre refit per fold, snapshot-derived unknown age refit per fold. LOO errors use the radar-20 normalization (amplitudes applied once, factor medians of the fold's scored rows divided out). Coverage is 0.5000 in every arm and basis because the per-basis band multiplier is searched to 50% on the same errors; it is reported for completeness and does not discriminate. No variant was adopted.

## Amplitude contest

Re-run after radar-20 follow-up batch 6 aligned `fitFactorAmplitudes` to the production centre: residuals are now taken against the dispersion-aware shrinkage blend `estimate()` predicts from (`blendedCalibrationCentre`), where the fit previously used the unshrunk category median (and a 50/50 category/global average at one live peer). The earlier figures are kept for comparison. The fixed (1, 1) arm does not use the fit and is unchanged.

| Arm | Growth amplitude | Maturity amplitude | Coverage | Median log error | Median absolute log error | Category MedAE | Global-anchored MedAE |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fixed (1, 1) | 1 | 1 | 0.5000 | −0.00000 | 1.23777 | 1.20152 | 1.34700 |
| Fitted per fold, production centre (current) | −1.0073 (folds −1.3021…−0.6256) | −1.8258 (folds −4.7658…+0.1967) | 0.5000 | −0.00000 | 1.30643 | 1.30643 | 1.31876 |
| Fitted per fold, unshrunk centre (before batch 6) | −0.8755 (folds −1.1809…−0.6171) | −3.2064 (folds −6.4477…−1.3850) | 0.5000 | −0.00000 | 1.29924 | 1.29924 | 1.31649 |

Stability, live peers split by sha256(slug) first-byte parity, slope and unknown age held at full-sample values:

| Half | Peers | Growth (current) | Maturity (current) | Growth (before) | Maturity (before) |
|---|---:|---:|---:|---:|---:|
| even | 59 | −0.8584 | −17.6131 | −0.6926 | −16.0825 |
| odd | 69 | −1.1126 | +5.1559 | −1.2441 | +4.1278 |

Gates: error gain ≥ 0.02 — fail (−0.0687; was −0.0615); coverage in [0.47, 0.53] — pass (0.5000); halves share sign and agree within 50% — fail (growth passes, maturity changes sign, as before). Rejected, same verdict as before the alignment. The per-fold maturity fit now crosses zero in at least one fold.

## Per-basis bias contest

Bias estimates come from a nested LOO: in the fold that leaves out peer *i*, each of the other 127 peers is left out in turn, and the bias for *i* is minus the median of those raw log errors (all of them for the in-fold scalar; only peers on *i*'s basis for the per-basis arms). Arm (iii) shrinks the per-basis log bias toward the in-fold scalar with weight n/(n+20), n = same-basis peers in the fold (97–99 category, 27 global-anchored). Arm (i) is production: one scalar from all 128 errors. Bands are rebuilt per arm with the production recipe.

| Arm | Overall MedAE | Overall median log error | Category MedAE | Category median log error | Global-anchored MedAE | Global-anchored median log error | Coverage (all / cat / GA) |
|---|---:|---:|---:|---:|---:|---:|---|
| (i) current single scalar | 1.23777 | 0.00000 | 1.20152 | +0.04777 | 1.34700 | −0.31519 | 0.50 / 0.50 / 0.50 |
| (i′) single scalar, in-fold (reference) | 1.26524 | +0.03774 | 1.18211 | +0.09141 | 1.38935 | −0.35036 | 0.50 / 0.50 / 0.50 |
| (ii) per-basis, in-fold | 1.30504 | +0.01040 | 1.18533 | +0.01040 | 1.54056 | +0.01900 | 0.50 / 0.50 / 0.50 |
| (iii) per-basis shrunk n/(n+20) | 1.31928 | +0.02402 | 1.18218 | +0.02402 | 1.51675 | −0.13817 | 0.50 / 0.50 / 0.50 |

Counts: 100 category, 28 global-anchored. In-fold log bias estimates (median across folds): scalar 0.26 for category folds and 0.25 for global-anchored folds; per-basis 0.19 category, 0.56 global-anchored; shrunk 0.20 and 0.43. Production scalar: 0.2422.

| Gate (versus arm i) | (ii) | (iii) |
|---|---:|---:|
| Overall MedAE gain ≥ 0.01 | −0.0673 fail | −0.0815 fail |
| Global-anchored \|median log error\| < 0.15 | 0.0190 pass | 0.1382 pass |
| Category MedAE worsens ≤ 0.01 | −0.0162 pass | −0.0193 pass |

Rejected: recentring the 28 global-anchored rows removes their bias but raises their absolute error by 0.17–0.19, which outweighs the category gain.

## Jackknife refit check

| Definition | Top-20 overlap | Folds below 1 | Minimum fold |
|---|---:|---:|---:|
| Reported: calibration sets rebuilt, slope / bias / unknown age fixed | 0.99844 | 3 (api3 0.90, falcon-finance 0.95, xsy 0.95) | 0.90 |
| Slope, bias factor and unknown age refit per fold | 0.99883 | 2 (api3 0.90, xsy 0.95) | 0.90 |

Per-fold refit ranges: slope −0.6267…−0.5385 (full −0.5951), bias factor 1.198…1.382 (full 1.274), unknown age 677–682.5 days (full 677). Difference 0.0004, below the 0.01 threshold; the board keeps the reported definition and value.


# Estimator contest: V0 versus V1 (radar-20 follow-up batch 6)

Same snapshot, 128 live peers, `estimatorContestReport(snapshot).model_averaging`. Every arm uses the production global size adjustment, a median bias correction and per-basis band multipliers searched to 50% coverage. Halves are alternate rows of the slug-sorted observations.

`factorWeight` now scales each row's own factor log-deviations: the weighted log value carries w·(ln g − ln g̃) + w·(ln m − ln m̃), with g, m the row's growth and maturity multipliers and g̃, m̃ the fold's scored-row medians. Before this batch the weight multiplied only the normalization constant, which the median bias correction cancelled, so V1 and the ensemble's half-weight member were V0 up to integer rounding of the implied values. The "before" rows are that cancelled measurement and must not be cited as a half-weight result.

| Arm | Overall MedAE | First-half MedAE | Second-half MedAE | Coverage (all / first / second) |
|---|---:|---:|---:|---|
| V0 current (weight 1, k 6) | 1.2378 | 1.1476 | 1.4251 | 0.500 / 0.516 / 0.484 |
| V1 factor weight 0.5 (current) | 1.2116 | 1.1802 | 1.4314 | 0.500 / 0.547 / 0.453 |
| V1 before batch 6 (weight cancelled) | 1.2376 | 1.1476 | 1.4253 | 0.500 / 0.516 / 0.484 |
| V2 shrinkage k 12 (4–48) | 1.3188 | 1.1449 | 1.3799 | 0.500 / 0.516 / 0.484 |
| Ensemble of V0, V1, V2 (current) | 1.2765 | 1.1360 | 1.3956 | 0.500 / 0.516 / 0.484 |
| Ensemble before batch 6 | 1.2831 | 1.1579 | 1.4262 | 0.500 / 0.500 / 0.500 |

V1 against V0: overall median absolute log error falls by 0.0262 (2.1%), but it rises in both halves (+0.0325 and +0.0063) and half coverage moves from 0.516 / 0.484 to 0.547 / 0.453. The estimator contest has no adoption rule of its own; under the rule the factor contest uses (overall at most 0.97× the baseline, each half at most 1.01×) V1 fails the overall gate (0.979×) and the first-half gate (1.028×). The conclusion does not change: V0 stays. What changes is the evidence: V1 is no longer identical to V0, it shows a small overall gain that does not hold in either half. It is consistent with the amplitude contest, where the fitted factor exponents are negative on live peers.
