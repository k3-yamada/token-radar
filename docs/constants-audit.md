# Constants audit (radar-12)

Scope: values in the scoring path and dashboard that can alter a value, rank, displayed band/grade, plan, selection, or dashboard shortlist. Line numbers refer to this checkout. Numeric loop counters, date arithmetic units, rounding precision, validation-only limits, and dossier packaging limits are listed where they affect the submitted entry but do not affect model estimates. “Snapshot fixed” includes lists and fields supplied by the competition input. Factor amplitude contest on 128 live peers: fixed amplitudes scored MAE 1.2374; fitted amplitudes scored 1.3328 (split MAEs 1.3470 and 1.3199), so fitting was rejected. The derived unknown-age variant scored 1.2374 and was adopted; its fold-wise test uses each fold’s known-age median.

## (a) Derived at build time from the snapshot — 6 entries

| Name / description | Current value | File and line | Origin and effect |
|---|---|---|---|
| Global size slope and center | fitted least-squares log(mcap/TVL) slope; center is median log TVL of eligible live rows | [backtest.ts](lib/domain/backtest.ts:362), used by [buildBoard.ts](lib/app/buildBoard.ts:10) | (a) Refit from each snapshot; changes calibrated ratios and all values. Fit set: live rows with positive cap and TVL, excluding the derivative list. |
| Calibration ratios and quartiles | per-category and global medians/q25/q75; global logs winsorized at p=.01 and p=.99 | [calibration.ts](lib/domain/calibration.ts:11) | (a) All statistics are computed from the snapshot. Percentiles are fixed procedures, not snapshot values (see class d). |
| Growth percentile and median change | per-protocol midrank percentile; median of reported change_7d values | [estimate.ts](lib/domain/estimate.ts:34), [calibration.ts](lib/domain/calibration.ts:82) | (a) Recomputed when membership or reported changes move. |
| Calibration correction and band widths | correction is exp(−median leave-one-out log error); widths selected on held-out errors | [backtest.ts](lib/domain/backtest.ts:329) | (a) Refit on snapshot leave-one-out results. |
| Factor normalization and selection shrink decision | growth/maturity medians across scored rows; top-10 bias and adoption boolean | [backtest.ts](lib/domain/backtest.ts:133), [buildBoard.ts](lib/app/buildBoard.ts:14) | (a) Snapshot-dependent; affects multipliers and potentially top-10 values. |
| Derived unknown listed age | median known `listed_at` age (currently 677 days) | [backtest.ts](lib/domain/backtest.ts:119), [estimate.ts](lib/domain/estimate.ts:29) | (a) Derived from known snapshot ages; adopted after the unknown-age contest with no more than 1% MAE change. Recomputed inside each leave-one-out fold. |

## (b) Fixed by competition format or snapshot — 5 entries

| Name / description | Current value | File and line | Origin and effect |
|---|---|---|---|
| Snapshot floor and contents | `floor_usd`, `as_of`, protocol records, watchlist, categories and chains come from input; no numeric default | [snapshot.ts](lib/infra/snapshot.ts:18), [types.ts](lib/domain/types.ts:1) | (b) Snapshot-fixed inputs drive all scored outputs. |
| Board output contract limits | 100–4000 rows; 3–12 farm steps; each 20–600 chars | [board.ts](lib/domain/board.ts:96) | (b) Submission format gate; these limits reject output rather than tune estimates. |
| Farm step shape | six steps (open, risk check, deposit, one weekly step, one category-specific engagement, category-specific exit), with activity over 4 or 8 weeks; one template per category group | [farmplan.ts](lib/domain/farmplan.ts:212), [types.ts](lib/domain/types.ts:70) | (b) Entry schema/content shape. The chosen week span is class (d), below. |
| Input schema validity | positive integer floor; ISO date; finite numeric TVL/cap/change; nulls allowed where schema says | [snapshot.ts](lib/infra/snapshot.ts:19) | (b) Input contract. Validation constants only reject malformed snapshots. |
| Vendor dossier contract | schema `makefun/dossier/v1`, max 4 MiB and 8 images, PNG/JPEG signatures; text/dashboard/image caps passed by entry | [makefun-board.ts](vendor/makefun-board.ts:45), [main.ts](main.ts:10) | (b), kit-fixed: submission packaging, not token estimates. Vendor constants are kept separate from model constants. |

## (c) Fixed by design and contested in a backtest — 4 entries

| Name / description | Current value | File and line | Origin and contest outcome |
|---|---|---|---|
| Growth/maturity shapes | `G2`, `M1`; shape alternatives G1/G3 and M2 exist | [estimate.ts](lib/domain/estimate.ts:22) | (c) Existing shape selection remains fixed; amplitude fitting was separately contested and rejected for this snapshot. |
| Shrinkage base `k` | 6; adaptive clamp 2–24, with higher-k contest arm 12, 4–48 | [types.ts](lib/domain/types.ts:47), [estimate.ts](lib/domain/estimate.ts:10) | (c) Model averaging contest compares V0, V1 and V2; outcome recorded in `tools/loo-contests-report.md` (estimator contest) and under "radar-20 follow-up fixes (3)": V0 stays. |
| Band multiplier selection | Search 0.50–3.00 by .01; target 50% held-out coverage | [backtest.ts](lib/domain/backtest.ts:314) | (c) Explicitly fitted per basis on held-out errors; output multipliers are snapshot-derived. Search range/target are fixed. |
| Dispersion-aware shrinkage toggle / single-peer blend | enabled for main model; blend tested as P0/P1 proxy contest | [backtest.ts](lib/domain/backtest.ts:402), [estimate.ts](lib/domain/estimate.ts:10) | (c) Contest arms exist; no stored score/outcome in repository. |

## (d) Fixed by design and never contested — 16 entries

| Name / description | Current value | File and line | If data changes materially |
|---|---|---|---|
| Winsorization tails | global p1 and p99 | [calibration.ts](lib/domain/calibration.ts:24) | Tail behavior may be too aggressive or too permissive as sample size and outlier frequency change. |
| Band grade thresholds | A: ≥10 peers and ratio ≤10; B: ≥5 and ratio ≤30; otherwise C | [backtest.ts](lib/domain/backtest.ts:358) | Peer-count and uncertainty distributions can shift, making grades too generous or too rare. |
| Rank uncertainty resampling | 200 resamples; seed `0x7b7a11`; percentile interval p05–p95 | [uncertainty.ts](lib/domain/uncertainty.ts:4), [uncertainty.ts](lib/domain/uncertainty.ts:39) | Larger or more heterogeneous samples may need more draws; fixed seed affects reproducibility, not central estimates. |
| Size-slope fitting set definition | live positive-cap/positive-TVL rows, with `DERIVATIVE` categories excluded; within-category alternative requires ≥2 rows | [backtest.ts](lib/domain/backtest.ts:362), [backtest.ts](lib/domain/backtest.ts:374) | A category taxonomy or coverage shift can change which populations set the size correction. |
| Global excluded-category list | Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX | [types.ts](lib/domain/types.ts:54) | New or renamed categories can enter global calibration unexpectedly; old categories can remain excluded after their behavior changes. |
| Dispersion clamp bounds | effective k clamped to 2–24; default base 6 | [estimate.ts](lib/domain/estimate.ts:10) | Category/global dispersion ratios outside the current range stop changing shrinkage. |
| Category sparse-support boundary | category count 1 uses global-anchored; count 0 global; otherwise category | [estimate.ts](lib/domain/estimate.ts:58) | Changed category coverage changes which calibration basis many rows use. |
| Minimum implied value | $1 (`Math.max(1, round(...))`) | [types.ts](lib/domain/types.ts:57), [estimate.ts](lib/domain/estimate.ts:83) | A radically lower floor or currency convention would make the dollar floor distort small estimates. |
| Maturity assumptions | min `.75`, range `.5`, cap 1460 days; fallback is the adopted snapshot-derived median age (677 days here) | [types.ts](lib/domain/types.ts:51), [backtest.ts](lib/domain/backtest.ts:119) | The fallback is class (a); shape limits remain design constants. |
| Growth tanh scale | 50 percentage points | [types.ts](lib/domain/types.ts:48) | A changed volatility regime compresses or exaggerates growth adjustments. |
| Growth center fallback | Shipped shape G2 centres on the midrank percentile 0.5 among protocols reporting `change_7d`; a missing change takes percentile 0.5, i.e. a neutral multiplier of 1, on the board and in the backtest alike. The median 7d change is passed to both paths as the same value: `factorNormalizers` receives the fold's `calibrate().medianChange` (it no longer falls back to 0), the value `estimate()` is scored with. G2 ignores that argument; it centres only the rejected G1 shape, where a missing change is also neutral. The observed median fills a missing `growth_pct` for display, and `MODEL.growth_median_change_7d: 0` is a placeholder overwritten with the observed median on emit. | [estimate.ts](lib/domain/estimate.ts:36), [backtest.ts](lib/domain/backtest.ts:155), [backtest.ts](lib/domain/backtest.ts:287), [calibration.ts](lib/domain/calibration.ts:86), [types.ts](lib/domain/types.ts:51), [buildBoard.ts](lib/app/buildBoard.ts:116) | A shifted change distribution moves the percentile ranks and so every growth multiplier and its normalizer; the neutral-at-missing rule stays fixed. |
| Board selection sizes | max 200, early 160, live side list 24 | [types.ts](lib/domain/types.ts:59) | Snapshot/watchlist growth can crowd out early rows or truncate the live list. |
| Farm capital tiers | TVL thresholds $100M/$1B/$5B map to $50/$100/$150/$250 | [farmplan.ts](lib/domain/farmplan.ts:11) | TVL scale shifts can make suggested capital inappropriate for the represented protocol set. |
| Farm fees and span | fees = step executions (5 one-off + 1 weekly × weeks) × the midpoint of the primary chain's assumed gas range per step (`CHAIN_GAS`, fix 38: Ethereum $1–$8 … Solana $0.001–$0.05); 4 weeks, or 8 if age <365 days | [types.ts](lib/domain/types.ts:61), [farmplan.ts](lib/domain/farmplan.ts:16) | Gas/fee markets and age mix can make plan totals stale. |
| Dashboard shortlist sizes | shortlist 6; top view 20 | [state.js](dashboard/state.js:38) | A changed board size or audience may make these panels too short or too long. |
| Dashboard display scales | 1K/1M/1B formatting and 3 significant digits | [components.js](dashboard/components.js:12) | Larger/smaller value ranges may lose useful precision or use unsuitable labels. |

## Sensitivity-pass order

### radar-12c measured sensitivity

Full leave-one-out recalibration on the 128 live peers; bias and per-basis band widths were refit for every arm. Baseline: 50.00% overall coverage, median log error −0.0000, median absolute log error 1.2374. Each row is measured against that baseline; no arm improved median absolute log error by the required 3% (threshold ≤1.2002), so no sensitivity variant was adopted.

| Choice / variant | Coverage | Median log error | Median absolute log error | Sensitivity range (median absolute log error) |
|---|---:|---:|---:|---:|
| Winsor 0/100 | 50.00% | −0.0000 | 1.2374 | **1.2374–1.2374** |
| Winsor 0.5/99.5 | 50.00% | −0.0000 | 1.2374 | |
| Winsor 1/99 (current) | 50.00% | −0.0000 | 1.2374 | |
| Winsor 2.5/97.5 | 50.00% | −0.0000 | 1.2374 | |
| Winsor 5/95 | 50.00% | −0.0000 | 1.2374 | |
| Shrink clamp [1,12], base 6 | 50.00% | −0.0000 | 1.2408 | **1.2374–1.2906** |
| Shrink clamp [2,24], base 6 (current) | 50.00% | −0.0000 | 1.2374 | |
| Shrink clamp [4,48], base 6 | 50.00% | −0.0000 | 1.2906 | |
| Global calibration: current exclusions (baseline) | 50.00% | −0.0000 | 1.2374 | **1.2374–1.2789** |
| Global calibration: no exclusions | 50.00% | −0.0000 | 1.2789 | |
| Slope fit: live peers outside excluded categories (baseline) | 50.00% | −0.0000 | 1.2374 | **1.2374–1.3650** |
| Slope fit: all live peers | 50.00% | −0.0000 | 1.3650 | |

The winsor arms tie at the reported precision on this snapshot. The current exclusions and slope-fitting population have lower error than their alternatives. `tools/sensitivity.mjs` reproduces these arms.

1. **Winsorization percentiles and global/category eligibility.** These directly set calibration ratios; changes in snapshot mix can silently alter the peer population and tails.
2. **Shrinkage base and clamp bounds.** They control how strongly sparse or unusually dispersed categories move toward global evidence.
3. **Growth and maturity constants.** These directly rescale every estimate and depend on volatility and age distributions.
4. **Grade thresholds and band search target/grid.** These shape displayed confidence and uncertainty interpretation as peer counts and residuals move.
5. **Size-fit population definition.** A changed category mix can alter the learned size correction even when the formula is stable.
6. **Farm capital, fee, and duration assumptions; board/live-list sizes; minimum value.** These affect advice or presentation and should be checked when units, fees, protocol scale, or snapshot coverage shift.
7. **Bootstrap count/seed and dashboard panel sizes/formatting.** Mostly reproducibility and presentation; revisit if rank uncertainty or output scale materially changes.

### Count note

The grouped inventory has 31 rows (6 class a, 5 class b, 4 class c, 16 class d). Rows group related literals that implement one rule; the class-d list above is complete at that rule level. `vendor/makefun-board.ts` contains further byte/line/PNG/JPEG protocol literals, separately kit-fixed; they constrain dossier serialization and do not feed radar estimates. `main.ts` packaging caps are likewise kit/submission limits. Dashboard rendering constants are included only where they affect displayed values or shortlist content.

## External review follow-up (radar-19)

Rank-range resampling now applies the production model and fitted size adjustment, and the jackknife consistency fix brought top-20 overlap from 0.80 to 0.9984 under the production model. Rank ranges reflect calibration resampling only, with growth and maturity factors held fixed.

Contest S (size-adjusting the global calibration set) was rejected: median absolute log error was 1.2374 for current calibration versus 1.3330 for the adjusted variant. Contest G (band-basis continuity for sparse categories) was also rejected: sparse-row coverage was 0.529 for current bands versus 0.588 for both variants; the variants moved farther from the 0.50 target with wider bands.

## Measurement integrity follow-up (radar-20)

The LOO score now uses `estimate().implied` as-is (factor amplitudes are already included) and divides out the growth and maturity medians computed over that fold's scored rows, matching production's median normalization. This removes the second amplitude application and the prior reversed normalization sign.

**Effect on the board.** The reversed sign had shifted every LOO log error by a near-constant −0.5755 (twice the log of the scored rows' factor medians), so the build-time bias factor was 0.7166 where the consistent measurement gives 1.2740. Every board row's `implied_value_usd`, `value_low_usd`, `value_high_usd` and `model.base_usd` therefore rises by ×1.7779 (198 of 198 rows; point-value ratio 1.777940–1.777941, band ends 1.7772–1.7787 because the residual quartiles moved by about 0.0004). Order, ranks, rank ranges, grades, ratios, multipliers and farm plans are unchanged. Corrected LOO metrics on the 128 live peers: coverage 0.500, median absolute log error 1.2378 (was 1.2374), category / global-anchored median log error +0.048 / −0.315. Earlier tables in this file were measured before the fix; at amplitudes (1,1) the fix moves those error figures by at most about 0.0005 and they were not re-run.

**Amplitude contest (corrected), rejected.** `tools/radar20-contests.mjs`, amplitudes refit inside every LOO fold. Full-sample fit: growth −0.875, maturity −3.206 (per-fold ranges −1.18…−0.62 and −6.45…−1.39). Median absolute log error 1.2992 fitted versus 1.2378 fixed (1,1): worse by 0.0615 against a required gain of 0.02. Coverage is 0.500 for both, inside [0.47, 0.53], but the band multiplier is searched to 50% in-sample, so this gate cannot discriminate. Slug-hash halves (sha256 first-byte parity, 59 / 69 peers): growth −0.693 / −1.244 (same sign, within 50%), maturity −16.08 / +4.13 (opposite signs). Two of three gates fail; amplitudes stay at (1,1). (These are the figures measured against the unshrunk category centre; the re-run against the production centre is under "radar-20 follow-up fixes (3)" and reaches the same verdict.) The fitted signs are negative: on live peers the residual falls with growth percentile and age, so the fixed positive factors are a design prior that this snapshot does not confirm. `fitFactorAmplitudes` now always uses the fitted peers' own median log TVL as size-adjustment centre; previously a caller passing only `{ mode, slope }` got NaN.

**Per-basis bias contest, rejected.** Nested LOO: inside each fold the other 127 peers are themselves left out one at a time and the bias is estimated from those errors. Median absolute log error overall / category / global-anchored, and global-anchored median log error: (i) current scalar 1.2378 / 1.2015 / 1.3470, −0.315; (ii) per-basis in-fold 1.3050 / 1.1853 / 1.5406, +0.019; (iii) per-basis shrunk n/(n+20) 1.3193 / 1.1822 / 1.5168, −0.138. Both variants bring global-anchored |bias| under 0.15 and improve the category basis, but overall error worsens by 0.067 and 0.082 against a required gain of 0.01. The single scalar stays. The scalar itself estimated in-fold scores 1.2652, so 0.027 of the gap is the cost of honest in-fold estimation that (i) does not pay; the variants still lose to that like-for-like arm. Full table in `tools/loo-contests-report.md`.

**Jackknife definition.** `top20_jackknife_overlap` is the mean, over the 128 live peers, of the share of the full board's top 20 that is still in the top 20 after one peer is removed and the category and global calibration sets are rebuilt. The size slope and centre, bias factor, unknown age and band parameters are held at their full-snapshot values. Refitting slope, bias factor and derived unknown age inside every fold gives 0.9988 against 0.9984 as reported (difference 0.0004, threshold 0.01): three folds lose a top-20 member under the reported definition, two under the refit. The reported value and definition are unchanged.

When selection shrink is adopted, the top ten estimates and bands are shrunk first, the board is sorted again and ranks are reassigned, and rank ranges plus the jackknife are computed from that final ordering. A forced-shrink regression checks value order, contiguous ranks, and a null board gate result. `rankRanges` and the jackknife intentionally describe the unshrunk model (the resampled values and the leave-one-out boards carry no shrink, and rank ranges are only widened to contain the final point rank), because the shrink is a board-level selection adjustment rather than part of the model; the sealed snapshot does not adopt the shrink, so the current radar-20 numbers are unaffected.

Zero-TVL pre-token rows are excluded from rankable/scored selection because logarithmic TVL adjustments require positive TVL; build metadata records the number excluded. The sealed input's $5M minimum makes this guard inert for that snapshot.

## radar-20 follow-up fixes

Three latent fixes; none changes a published number. A fresh build of the sealed snapshot gives byte-identical `board.json` (sha256 `089b3997…2524f`) and `data.js` (`d22d4136…705d3`), and the LOO observations under the production G2/M1 shapes are bit-identical before and after (default arm and the fitted + derived-unknown-age arm).

**Reported amplitudes follow the evaluated procedure.** `factorChangeReport` decides adoption on amplitudes refit inside every LOO fold, so there is no single evaluated pair: each of the 128 folds has its own. The `amplitudes` field is now the full-sample fit through that same procedure (`evaluatedAmplitudes`, the helper every fold calls), under the unknown-age setting of the fitted arm the adoption rests on: the fixed 365-day unknown age, or the derived one only when both the fit and the derived unknown age are adopted. Before, it was always fitted at the full-sample derived unknown age (677 days here), a setting the deciding arm did not use. On this snapshot the field moves from (−0.875, −3.206 at 677 days) to (−0.875, −3.265 at 365 days); it is not emitted because amplitudes are not adopted. The radar-20 contest figures above come from `tools/radar20-contests.mjs`, which calls `fitFactorAmplitudes` directly at the derived unknown age, and are unaffected. Still open: if amplitudes were adopted, `buildRadar` would record them and switch the calibration backtest, but it does not pass them to `buildBoard`, so the board itself would keep (1,1).

**Fold normalizers use the fold's median change.** `factorNormalizers` passed 0 as the median 7d change to `growthFactor`; it now receives the fold's `calibrate().medianChange`, the value `estimate` is scored with. G2 ignores the argument, so production is unchanged; a G1 backtest does change (it was mis-centred before), G3 is constant and does not.

**One scored-row selection.** The watchlist-plus-early-rows selection existed twice (`buildBoard` and a private copy in the backtest) and is now `selectScoredRows` in `lib/domain/eligibility.ts`, used by both. The copies differed in the slug tie-break for equal TVL (`localeCompare` in the backtest, code-unit order on the board); the shared helper keeps the board's code-unit order. The sealed snapshot has no TVL ties among its 198 rankable rows and both orders agree on all 758 slugs, so the selection is the same there. The backtest still selects with the production `MODEL` row limits, as before.

**Adopted amplitudes reach the board.** Closes the gap left open above: when (and only when) the factor report adopts amplitudes, `buildRadar` now passes them in `buildBoard`'s `calibrationOptions` alongside the bias factor, size adjustment and unknown age, so the production board and the jackknife boards use them instead of silently staying at (1,1); the sealed snapshot does not adopt amplitudes, so the key is absent and `board.json` / `data.js` keep the hashes above, and a regression with an injected adopting report checks the board against `buildBoard` at those amplitudes.

## radar-20 follow-up fixes (2)

Four small fixes from an external review of radar-20; none changes a published number. A fresh build of the sealed snapshot still gives `board.json` sha256 `089b3997…2524f` and `data.js` `d22d4136…705d3`, and the default-arm LOO observations are bit-identical before and after. The suite is 40 cases (36 before).

**Within-category slope diagnostic.** `measurementReport` subtracted 1 from `withinCategorySlope`, which already returns the log-ratio slope, so `within_category_ratio_slope` was understated by exactly 1.0: the sealed snapshot now reports −0.3519 where it reported −1.3519 (global −0.5951, unchanged). The field is only read by `runBacktest` diagnostics, never by the build.

**Shrink band guard.** The selection-shrink block now caps `value_low_usd` at the scaled `implied_value_usd`, mirroring the existing `value_high_usd` guard. Because both values go through the same monotone `max(1, round(x × factor))`, a row with low ≤ implied before the shrink cannot violate the band after it, so the guard is defensive and cannot change an output; the regression asserts low ≤ implied ≤ high on forced-shrink boards, including rows at the $1 floor.

**`factorWeight` is live again.** `backtest()` declared `factorWeight` but ignored it after radar-20, so the estimator contest's V1 arm and the ensemble's half-weight member silently equalled V0. The weight scales the normalization term again (`(−ln g − ln m) × factorWeight`); the default 1 is bit-identical. Estimator-contest V1 and ensemble figures recorded between radar-20 and this fix were V0 under another name and need a re-run before being cited. (Superseded: weighting the normalization constant still cancelled under the bias correction; see "radar-20 follow-up fixes (3)" for the row-level weight and the re-run.)

**Unknown age is always emitted.** `buildRadar` always writes `derived_unknown_listed_age_days` (the age in use: the derived median when adopted, otherwise `MODEL.unknown_listed_age_days`), so the dashboard method text can no longer print "undefined days". The sealed snapshot adopts the derived age (677), so `data.js` is unchanged. When the derived age is not adopted the dashboard sentence still calls the figure the snapshot median known age; that wording is not conditional yet.

**Unknown-age wording follows the age in use.** The dashboard method text now says "the snapshot median known age (N days)" only when the emitted age differs from the model default and "the model default age (365 days)" when it equals it, which closes the wording gap noted above. The data carries no adoption flag and `model.unknown_listed_age_days` is overwritten with the age in use, so `dashboard/components.js` compares against its own `MODEL_DEFAULT_UNKNOWN_AGE_DAYS = 365`, which a test holds equal to `MODEL.unknown_listed_age_days`; no field was added, the sealed snapshot (677, adopted) renders the same sentence as before, and `board.json`/`data.js` hashes are unchanged. Known coincidence: an adopted derived median of exactly 365 days would be labelled the model default (the number shown is still the age in use). Not changed here: the emitted `model.factor_normalization` string still says "snapshot-derived" in the non-adopted case. The suite is 41 cases.

**`factor_normalization` follows the adoption decisions.** The emitted `model.factor_normalization` string said "unknown listed_at age is snapshot-derived (N days)" unconditionally; it now keeps that exact wording only when the derived age is adopted and says "unknown listed_at age is the model default (365 days)" otherwise, and (same class, found in the sweep) names the fitted exponents when amplitudes are adopted, in the string and in the dashboard method text, instead of describing the unpowered factors. The sealed snapshot adopts the derived age and not the amplitudes, so the string and both hashes are byte-identical; the suite is 42 cases.

## radar-20 follow-up fixes (3)

Batch 6, from Gemini's grounded re-review of the tree after batches 1–5 and one item from Sakana's re-review. No published number changes: a fresh build of the sealed snapshot gives `board.json` sha256 `089b3997…2524f` and `data.js` `d22d4136…705d3`, the default-arm LOO observations are bit-identical, and the dashboard method text rendered from the sealed `data.js` is byte-identical before and after. The suite is 45 cases (42 before). Two findings are held open rather than applied because applying them changes what the sealed snapshot emits or displays: the basis vocabulary (fix 5) and the zero-count grade guard (fix 4b).

**1. `factorWeight` weights each row's factor deviations.** The previous fix multiplied only the normalization constant, `(−ln g̃ − ln m̃) × w`. `calibratedContest` then removes the median log error, and a near-constant offset `(1 − w)(ln g̃ + ln m̃)` is exactly what that removes, so V1 (w = 0.5) and the ensemble's half-weight member still equalled V0 up to rounding. `backtest()` now applies the weight to the row's own factor log-deviations: the weighted log value carries `w·(ln g − ln g̃) + w·(ln m − ln m̃)` in place of the unweighted deviations, where g, m are the powered growth and maturity multipliers of the row's prediction and g̃, m̃ the `factorNormalizers` medians of the fold. At w = 1 nothing is added and the observations are bit-identical; at w = 0 the score equals a factor-free prediction. Regressions: the weight-0 arm matches an independent G3/M2 estimate, and after the median bias correction the w = 0.5 arm differs from w = 1 by exactly half of each row's deviation plus one constant (the earlier wiring fails both).

Estimator contest re-run (`estimatorContestReport`, 128 peers; overall / first half / second half median absolute log error): V0 1.2378 / 1.1476 / 1.4251; V1 1.2116 / 1.1802 / 1.4314 (was 1.2376 / 1.1476 / 1.4253, i.e. V0); V2 1.3188 / 1.1449 / 1.3799; ensemble 1.2765 / 1.1360 / 1.3956 (was 1.2831 / 1.1579 / 1.4262). Halving the factor weight lowers overall error by 0.0262 (2.1%) but raises it in both halves (+0.0325, +0.0063) and pushes half coverage from 0.516 / 0.484 to 0.547 / 0.453. The contest has no adoption rule of its own; under the factor contest's rule (overall ≤ 0.97×, each half ≤ 1.01×) V1 fails overall (0.979×) and in the first half (1.028×). The V0-versus-V1 conclusion does not change, V0 stays, but V1 is now a real measurement and not a copy of V0. Full table in `tools/loo-contests-report.md`.

**2. `factorNormalizers` selects with the model it is given.** It passed the module constant `MODEL` to `selectScoredRows` while taking a `model` argument, so a backtest arm with custom row limits normalized by the production selection. It now passes its argument; the snapshot it selects from is unchanged (the fold's reduced snapshot, as designed). Every existing caller passes the production `MODEL`, so nothing published moves. A regression runs a custom arm (`early_rows: 0`) and checks its normalizers and its backtest errors against that model's own scored rows. This supersedes the sentence above that the backtest still selects with the production row limits.

**3. Amplitude fit uses the production centre.** `fitFactorAmplitudes` took residuals against the unshrunk category median (a 50/50 category/global average at one live peer). It now uses `blendedCalibrationCentre`, the dispersion-aware shrinkage blend `estimate()` predicts from (the global centre when a category has no live peer). A regression rebuilds the residuals from `estimate().centre` and checks the fit against them.

Amplitude contest re-run end to end (`tools/radar20-contests.mjs`), new figure (old figure): full-sample fit growth −1.0073 (−0.8755), maturity −1.8258 (−3.2064); per-fold ranges growth −1.3021…−0.6256 (−1.1809…−0.6171), maturity −4.7658…+0.1967 (−6.4477…−1.3850); median absolute log error fitted 1.3064 (1.2992) against 1.2378 fixed, a loss of 0.0687 (0.0615) where a gain of 0.02 is required; coverage 0.500, gate passes but cannot discriminate; halves growth −0.858 / −1.113 (−0.693 / −1.244), maturity −17.61 / +5.16 (−16.08 / +4.13), opposite signs. Verdict unchanged: rejected, two of three gates fail, amplitudes stay at (1,1). The build's own decision (`factorChangeReport`, fitted arm at the 365-day unknown age) also still rejects: 1.3099 fitted against 1.2378 baseline. Its unemitted `amplitudes` field moves from (−0.875, −3.265) to (−1.007, −2.362). The per-basis bias contest and the jackknife refit check in the same tool do not use the fit and reproduce their recorded figures.

**4. Dashboard text.** (a) The method explanation printed a hardcoded "128" leave-one-out estimates; it now prints `calibration_backtest.peers_evaluated` (128 on the sealed snapshot, so the sentence is unchanged there; a test renders a 14-peer fixture). (c) The Implied value column tooltip described the band as the calibration set's quartiles; it now says the band is the middle half of the model's leave-one-out backtest errors for the row's basis, widened to cover half of them, which is how `residual_quantiles` and the band multipliers build it. (b) **Not applied, decision open.** A guard that prints only the count for a grade with no backtest estimates changes the sealed snapshot's method text, because grade A has count 0 there: the text reads "A carried 0 estimates with 0.0% coverage and 1.0× median absolute log error", figures formatted from null fields, and the guard would shorten it to "A carried 0 estimates". That conflicts with the requirement that the rendered method text stay byte-identical, so the guard was written, verified to change exactly that clause (2,777 → 2,723 characters), and taken out again. The fabricated figures are therefore still displayed for grade A. Neither hash depends on it, and `screenshots/4-calibration.png` ends above that sentence.

**4b applied (batch 7).** The byte-identical requirement was lifted for this one clause, so the zero-count guard is now in `dashboard/components.js`: a grade whose `grade_backtest` count is 0 prints only its count, and a grade with estimates keeps its full sentence. On the sealed snapshot the method text changes in exactly one place, "A carried 0 estimates with 0.0% coverage and 1.0× median absolute log error" becomes "A carried 0 estimates" (2,777 → 2,723 characters), with the B and C clauses and everything else identical; this supersedes the "not applied" note in 4(b) and the statements above that the method text is byte-identical and that 4b is held open. The guard is dashboard-only, so `board.json` and `data.js` keep the hashes above, and the suite is still 45 cases (the method-text case gained assertions for zero-count and measured grades).

**5. Basis vocabulary: not changed, it is emitted.** `estimate()` labels its basis `'global'` at count 0 and `'global-anchored'` at count 1; `buildBoard` keys its band parameters by `'category' | 'global_anchored'`. The `estimate()` string is not internal: `buildBoard` copies it to `ratio_basis` and `buildRadar` to the radar rows, so it is in both `board.json` and `data.js` (sealed snapshot: 133 `category`, 47 `global-anchored`, 18 `global` in each), and `category_ratio_source` is derived from the `'global'` value. Unifying the vocabulary would change both hashes, so nothing was changed, in code or in the inventory row above, which still describes the emitted labels correctly. The two vocabularies are consistent in use: every consumer of the backtest observations tests `basis === 'category'` and treats the rest as global-anchored, and the dashboard does not read `ratio_basis`.

**6. Dead option and alias.** `calibrateBacktest()` returned `widthMultiplier` (singular, the category multiplier) next to `widthMultipliers`; nothing in `lib/`, `tools/`, `test/` or `dashboard/` read it, and it is removed with both hashes unchanged. `CalibrationOptions.adjustGlobal` is retained: production never sets it, but `tools/loo-contests.mjs` enables it for the S1 arm of contest S (the rejected size-adjusted global set recorded above), so it is a live research option, not dead code.

**Reviewed and kept.** Selection shrink versus `rankRanges` and the jackknife: when the shrink is adopted, rank ranges and the leave-one-out boards still describe the unshrunk model. This is the intentional behaviour documented under "Jackknife definition" above (the shrink is a board-level selection adjustment, and ranges are widened to contain the final rank); the sealed snapshot does not adopt the shrink. Zero-TVL watchlist rows: `selectScoredRows` skips a watchlist protocol with zero TVL while `watchlist_size` counts the whole list, but `boardIssue` refuses any board that misses a watchlist slug, so the build fails on such a snapshot by design. Whenever a board exists every watchlist slug is on it and the "Watchlist covered" header is accurate.


## radar-20 follow-up fixes (4)

Batch 8, from an external review of the pushed radar-20 code. No published number changes: a fresh build of the sealed snapshot gives `board.json` sha256 `089b3997…2524f` and `data.js` `d22d4136…705d3`. The suite is 46 cases (45 before: one case added and the forced-shrink case extended, both for fix D).

**A. `RadarData` declares `zero_tvl_excluded_from_scoring`.** `buildRadar` already emitted the field; `lib/domain/types.ts` did not declare it. Type only, nothing emitted changes.

**B. Build summary counts the dashboard files.** `main.ts` printed a hardcoded "(3 files)" for the dashboard; it now prints the length of the array `collectFlatFiles` returns (5 on this tree). Stdout only.

**C. Dead code removed.** The unused `const peers = …` in `lib/domain/board.ts` (`peer_token_share` is computed separately) and `contestArm` in `lib/domain/backtest.ts` (unexported, and no reference anywhere in `lib/`, `test/`, `tools/`, `dashboard/` or `main.ts`).

**D. Rank ranges are resampled under the selection shrink.** When the Top-10 shrink is adopted, `buildRadar` rescales the ten leading rows and re-sorts before `rankRanges`, but the resampling ranked unshrunk values, so the intervals described a different model from the point ranks. `rankRanges` now takes `shrink: { slugs, factor }` (the slugs that were rescaled and `exp(−bias)`) and applies the factor to those slugs' resampled values in every iteration before ranking, with the same round, scale, round and $1 floor as the point estimate; `buildRadar` passes it only when the shrink is adopted. This supersedes the two statements above that `rankRanges` intentionally describes the unshrunk model. The jackknife is unchanged and still compares unshrunk leave-one-out boards. The sealed snapshot does not adopt the shrink, so the option is absent there and the resampling is bit-identical. Regressions: a two-row board where a 0.5× shrink reverses the order gives exact intervals `[1,1]`/`[2,2]` under the shrink and `[1,2]`/`[1,2]` without it; and the forced-shrink `buildRadar` case checks that the emitted intervals equal a resample with the shrink and differ from one without.

**E. Click path guards the detail scroll.** `dashboard/app.js` called `document.querySelector('.detail').scrollIntoView(…)` unguarded on row click; it now has the existence check the keyboard path already had.

**F. Non-sortable headers are not buttons.** The Chains and Tokenized peers headers were `<button>` elements with no action; they are now `<span>` with the same label (no class is needed: the `th button` rule only resets button chrome to what a span inherits). Sortable headers stay buttons. Rendering the board from the sealed `data.js` before and after differs in exactly those two tags, plus the two tooltip classes of fix H.

**G. Verified, no change.** `MODEL_DEFAULT_UNKNOWN_AGE_DAYS = 365` in `dashboard/components.js` is test-guarded as its comment says: the case "dashboard method text names the unknown-age source truthfully, adopted or not" reads the constant out of the dashboard source and asserts it equals `MODEL.unknown_listed_age_days`.

**H. Right-edge tooltips align right.** `.info-tip::after` is centred on its marker, which can clip off the right edge. A modifier `.info-tip-right` (`right: 0; left: auto; transform: translate(0, 3px)`, and `translate(0, 0)` on hover/focus) is applied to the two right-edge tips only: the Implied value column header and the tip at the end of the grade strip. Other tips are unchanged.

**Reviewed and kept.**

- `MODEL_VERSION` remains `'radar-12'`: changing it alters `data.js`, and it is a labelling decision, not a bug fix.
- The Start-here shortlist stays at 5 items in the 3-column grid: a design decision.
- Farm-plan fee totals stay as the hand-summed midpoints: pinned by an exact-sum test, and restructuring risks the displayed text.
- The excluded-category list stays defined in its three contexts: types, calibration and eligibility use different casings and purposes.
- The per-render `valueScale`/`maxTvl` recompute stays: 198 rows, negligible.
- No extra dashboard sentence about in-sample band fitting: the nested-LOO optimism figures are already recorded in this audit and in `tools/loo-contests-report.md`.

## radar-20 follow-up fixes (5)

Batch 9. Both changes are the user's decisions; they reverse the first two "Reviewed and kept" items of batch 8, which had left them open as labelling and design choices and not as defects. No estimate, band, rank or grade changes: a fresh build of the sealed snapshot gives `board.json` sha256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`, unchanged. `data.js` is now `a1690f13f03e6ad6dcbc84ee5291dacec7d7d9769ef9cff36d5e86d740f4fdba` (was `d22d4136…705d3`); it differs from the previous build only in the `model_version` field. The suite stays at 46 cases, none edited.

**Version label is `radar-20`.** `MODEL_VERSION` in `lib/domain/types.ts` changes from `'radar-12'` to `'radar-20'`, so the label matches the model that has been published since the radar-20 normalization. It reaches `data.js` as `model_version`, which the dashboard header eyebrow and the method summary display. The one other pinned copy, the `<title>` in `dashboard/index.html`, is updated to match. No test asserts the literal value. The title of this document and its earlier sections keep the labels they were written under.

**Start-here shortlist has 6 items.** `dashboard/state.js` takes `.slice(0, 6)` (was 5), so the 3-column grid fills two complete rows with no empty cell. No CSS change is needed: the border rules are periodic (`:nth-child(3n)` at full width, `:nth-child(2n)` in the 2-column layout at 760px and below, which gives three complete rows, and no right border in the 1-column layout), and the stagger delays for items 4 to 6 use the same `0ms` fallback items 4 and 5 already had. No test asserts the shortlist length. Screenshots are regenerated separately.

## radar-20 follow-up fixes (6)

Batch 10a, from an external review of `lib/domain/backtest.ts`. No estimate, band, rank, grade or published statistic changes: a fresh build of the sealed snapshot gives `board.json` sha256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` and `data.js` sha256 `a1690f13f03e6ad6dcbc84ee5291dacec7d7d9769ef9cff36d5e86d740f4fdba`, both unchanged. `correctionFactor`, `widthMultipliers` and `residualQuantiles` are unchanged. The suite goes from 46 to 49 cases (3 added, none edited).

**FIX 1. Amplitude adoption gate no longer reads undefined halves.** `factorChangeReport` compared `fitted.summary.first_half` and `second_half` with the base arm's, but `calibrateBacktest().summary` is `summarizeBacktest`'s `{ all, by_basis }`. The halves were `undefined`, so the gate would have thrown a `TypeError` the first time the fitted arm's overall median absolute log error came in at or below 0.97 of the base. On the sealed snapshot the fitted arm loses, the first condition is false and short-circuit evaluation hid it. The gate is now the exported pure function `adoptFittedAmplitudes(fitted, base)` over two `ContestMetrics` (the slug-ordered alternating halves `contestMetrics` already computes from each arm's observations): overall at most 0.97 of base, and each half at most 1.01 of the base half. The overall figure is the same number as before (`contestMetrics(...).overall` is `summarizeBacktest(...).all`). Tests: synthetic adopt and reject cases with the first condition true, so the halves comparison executes; the report's decision equals the gate applied to the report's own metrics; and on the sealed snapshot `adopted_amplitudes` is still `false`. The sealed-snapshot case finds the file by `TOKEN_RADAR_SNAPSHOT`, `/input/snapshot.json` or the sibling kit directory, checks its SHA-256, and is skipped when the snapshot is absent.

**FIX 2. Coverage test versus the emitted band.** The review's claim is correct for `backtest()` and for nothing that reaches the board. With `logError = ln(predicted / realized)`, `estimate()` emits the log band `[centre - low, centre + high]`, so the realized value is inside iff `-high <= logError <= low`. `backtest()` tested `-low <= logError <= high`: lower and upper widths swapped. `calibrateBacktest` builds the residual band `[centre + m * r25, centre + m * r75]`, inside iff `-m * r75 <= logError <= -m * r25`; it stored `lowLogDistance = r75` and `highLogDistance = -r25`, a second swap in the field meanings that cancelled the first. The production path was therefore right by two opposite errors. Both are now removed: one helper, `withinBand(logError, low, high, width)`, holds the test `-width * high <= logError <= width * low`, every site uses it, and `lowLogDistance` / `highLogDistance` everywhere mean centre minus lower edge and upper edge minus centre. `estimate()` and the residual quantiles are untouched.

Per path:

- `backtest()` `covered`: **inconsistent, fixed.** It scores the peer-quartile band (`centre - q25`, `q75 - centre`), whose two sides differ, with the sides swapped.
- `summarizeBacktest` coverage: counts `covered`, so it inherits the verdict of whichever function built the rows. No change of its own.
- `bestBandMultiplier`: used the swapped formula. **Consistent when called from `calibrateBacktest`** (fields were swapped to match), **inconsistent when called on `backtest()` rows** (`calibratedContest`, `ensembleContest`). Now uses `withinBand`.
- `calibrateBacktest` (multiplier search and final observations): **coverage consistent before and after**; only the field meanings were wrong. Fields are now `lowLogDistance = -r25`, `highLogDistance = r75`. The comparisons are the same floating-point expressions, so the multipliers, `covered`, coverage and `bandRatio` are bit-identical. This is the only path that feeds `data.js` (`calibration_backtest`, `grade_backtest`, `grade_band_backtest`, `band_width_multipliers`).
- `calibratedContest`: **inconsistent, fixed.** Width search and final coverage both ran on `backtest()` rows.
- `ensembleContest`: **inconsistent, fixed.** Its averaged `low`/`high` edges and distances were right; both of its coverage tests were swapped.
- `measurementReport`: W0, W1, P0 and P1 are `calibrateBacktest` summaries, **consistent**. `P1_proxy` was **inconsistent, fixed**: it re-ran `backtest()` with the residual-fit width multipliers applied to the peer-quartile band (a band no build emits) and with the swapped test. It now filters the calibrated arms' own observations to the proxy slugs, so its coverage is against the residual band production uses. Its errors are the same rows and are unchanged.
- `runBacktest` (`tools/backtest.mjs`) `dispersion_effect`: reads only median absolute log error from a `backtest()` run; coverage is not used. No change.
- `tools/loo-contests.mjs`, `tools/sensitivity.mjs`: read `calibrateBacktest` output only. **Consistent**, no change.
- `tools/radar20-contests.mjs` `score()`: its own inline test was already correct; its `bestBandMultiplier` call passed the swapped fields and is updated to the corrected meanings. **Consistent before and after.**
- Nothing outside `backtest.ts` and that tool reads `lowLogDistance` or `highLogDistance`; neither field is emitted.

Figure changes on the sealed snapshot (before and after, same commands):

- `tools/loo-contests.mjs` and `tools/radar20-contests.mjs`: output byte-identical. `tools/sensitivity.mjs`: byte-identical.
- `tools/backtest.mjs`, `measurements.contest.P1_proxy` coverage (16 proxy rows): P0 0.500 → 0.625, P1 0.250 → 0.5625. Median and median absolute log errors unchanged (P0 1.218, P1 1.084). The earlier reading that the single-peer blend halves proxy coverage was an artefact of the mismatched band.
- `estimatorContestReport` (no tool; run directly), coverage only, every median and median absolute log error unchanged:

| arm | overall | first half | second half |
|---|---|---|---|
| centre median, and V0 | 0.500 → 0.492 | 0.516 → 0.500 | 0.484 (same) |
| centre trimmed mean | same | 0.563 → 0.531 | 0.438 → 0.469 |
| centre Huber mean | same | 0.547 → 0.516 | 0.453 → 0.484 |
| V1 (factor weight 0.5) | 0.500 → 0.492 | 0.547 → 0.500 | 0.453 → 0.484 |
| V2 (higher k) | same | 0.516 → 0.500 | 0.484 → 0.500 |
| ensemble | same | 0.516 → 0.500 | 0.484 → 0.500 |

The quadratic-size arm is unchanged in every figure. Overall coverage moves by at most one row in 128 and the half coverages move toward 0.5; no contest is re-decided here.

Tests added for this fix: `withinBand` on an asymmetric band; every `backtest()` row's `covered` equals membership of the realized value in the band rebuilt from the row's own distances, on a fixture where the swapped test scores at least one row differently; every `calibrateBacktest` observation carries `-r25` / `r75` and is covered iff `m * r25 <= ln(realized / predicted) <= m * r75`.

**Other items of the same review: dispositions.**

- `calibrate()`'s `adjustGlobal` asymmetry (category logs size-adjusted, global logs not) is the contested S1 arm. It is kept off; the contest tool (`tools/loo-contests.mjs`) is retained.
- The emitted `statistics_label: 'raw set statistics'` on category entries whose statistics are size-adjusted is **FLAGGED, not changed**. Changing it alters `data.js`; it awaits a decision.
- The slope fitted on the full sample, in-sample correction and width reporting, in-sample shrink adoption and full-sample `changePercentiles` are the known, quantified LOO limitations. The nested-LOO figures are already recorded in this audit.
- `rankRanges`' independent resampling of category and global sets, and its use of the `round4` multipliers, are kept. A row-level bootstrap is a model change, not a fix.
- `fitFactorAmplitudes` stays univariate. Amplitudes are rejected on stability grounds regardless.
- The kernel `peerWeighting` path is research-only. Its 365-day age fallback and its NaN edge (zero total weight) are noted; neither is reachable from production.
- `buildRadar`'s duplicate `calibrateBacktest` call, `estimateCentre`'s median inside the loop and `board.ts`'s per-row `peer_token_share` scan are build-time costs only.

## radar-20 follow-up fixes (7)

An external review of `dashboard/` (`index.html`, `state.js`, `app.js`, `components.js`, `app.css`). Only the dashboard, its tests and this document changed; `board.json` and `data.js` are inputs here and are byte-identical. On the sealed data the shortlist, board and header render pixel-identical to the previous dashboard; the chart, the detail view and the behaviours below are the intended differences.

**Outcomes.**

1. **Chart scale overflow: fixed.** `chart()` scaled by the top point estimate but placed bands by their lows and highs; on the sealed data the largest high is 5.26 times the top estimate, so bands ran off their tracks (the page was about 2,970px wider than the viewport at 1320px). The scale is now the largest high across the 20 rows, as the board's `valueScale` takes its maximum from `value_high_usd`. It stays linear, because the bars are lengths from zero. The bars are correspondingly shorter. `.bar-row`'s fourth column is 48px at every breakpoint (grade 23px + gap 5px + tip 17px), with narrower name, track and value columns under 430px so the row fits a 320px viewport.
2. **Number format: fixed.** `usd()` chooses its unit from the rounded figure and gains `T`; `sig()` and the method table's ratios go through one formatter that never returns exponential form. `usd(999500)` is `$1M`, `usd(999499)` is `$999K`, a ratio of 1234.5 prints `1230×`. Figures below 1000 in their unit are unchanged.
3. **Info tip inside buttons: fixed.** A shortlist card is now a `div`; its name is the `<button>` (carrying `data-slug`), stretched over the card by `.short-open::after`, and the grade tip is the button's sibling. Board rows keep their tips (a `tr` is not a button); `app.js` ignores clicks that land on a tip and handles Enter and Space only when the row itself has focus. Verified in headless Chromium: a click or key press on a tip opens nothing, and every part of a card still opens the detail.
4. **Focus restoration: fixed.** `app.js` remembers the opener element and its region. Opening and closing the detail no longer rebuilds the board, so the opener survives; if a sort or filter rebuilt it meanwhile, the same protocol's row in the same region takes focus. Focusing it scrolls it back into view.
5. **Render churn: fixed.** The duplicate initial build is gone (`UI.board` builds the table; `mount()` no longer calls `updateBoardResults` again). The row-in, band-grow and tick-in animations are scoped to `.is-entering`, which the page carries only until the first re-render. The `change` listener is removed; `input` covers the search box, the selects and the checkbox.
6. **Sort direction: fixed, with one judgement.** `RadarState.sortBy` starts TVL and Implied value descending and Protocol and Category ascending. **Rank still starts ascending**: rank 1 is the largest implied value, so ascending rank is already largest-first, and descending would open the column on row 198. A repeat click flips any column.
7. **Grade counts: now from the filtered rows.** The strip is rendered by `updateBoardResults`, inside the board results, below the controls and beside the "N of M protocols" count. It is part of the results summary, so `state.js` counts the filtered rows. With no filter the figures are unchanged (A 0, B 76, C 122).
8. **Accessibility: fixed.** `aria-live` is off `<main>`; the count paragraph is the one live region (`role="status"`, polite, atomic), and it now persists across re-renders, because a replaced node is not announced. The three selects carry `aria-label`s. Escape closes the detail with the same focus restoration.
9. **Detail derivation: added.** The heading existed but only the farm steps followed it. Three steps now precede them: TVL × ratio × bias correction = base (naming the ratio's set, basis and live-peer count), × growth multiplier, × maturity multiplier = implied value (with the age used, or the fallback age when the listing date is unknown). The bias correction is a step because `base_usd` includes it; a test checks the printed arithmetic against every sealed row. The peer line did switch silently between two measures; each form is now labelled ("by protocol count", or "by TVL share" for the 18 sealed rows whose category has no calibration set).
10. **Dead code: one of two removed.** `.short-share` had no use and is gone. `precise()` is **kept**: it is called by the board's value cell and the detail's value line.

**Kept, with reasons.**

- `boardMedianBandRatio`'s NaN on an empty board is unreachable: the build gate requires at least 100 rows.
- The `unknownAgeSource === 365` comparison is inert on any snapshot whose derived age is not exactly 365, and the robust fix would change `data.js`'s shape.
- `state.js` still recomputes invariant aggregates on every keystroke: 198 rows, and the animation and double-build fixes address the churn that was visible.

**Not changed, noted.** `out/dashboard/` is a build copy and still holds the previous dashboard until the next build. Screenshots were not regenerated. Tips at the right edge of the chart and the detail can still extend the page by about 120px when their tooltip is laid out; that predates this batch.

Tests added (7): chart bands inside their tracks on a synthetic case and on the sealed data; `usd` and ratio formatting; no focusable element inside a button and the shortlist structure; sort start directions; grade counts and the persistent live region; the derivation steps and peer labels on every row.

## radar-20 follow-up fixes (8)

An external review of `main.ts`, `lib/infra/`, `lib/app/runBacktest.ts` and `package.json`. On the sealed snapshot a fresh build is byte-identical to the previous one: `board.json` `089b3997…2524f`, `data.js` `a1690f13…fdba`, the same `dossier.json`, and the same stdout.

**Outcomes.**

1. **Stale outputs: fixed.** `collectFlatFiles` removes the destination subdirectory (`rmSync`, recursive and forced) and recreates it before copying, so a file that has left `dashboard/` or `screenshots/` cannot survive a re-run and be packaged by `buildDossier`. Verified by seeding `dashboard/old-removed.js`, `dashboard/sub/deep.js` and `screenshots/9-stray.png` into an output directory and re-running: all three are gone and the tree, dossier included, is identical to a clean build. (The previous code failed that same re-run on the 5th image.) One guard was added: when the destination resolves to the source itself (`--output .`), nothing is removed or copied, since removing it would delete the sources.
2. **Error handling and validation order: fixed.** The run is `main()` inside one `try`. A `SnapshotError` prints `token radar: <message>` and exits 2, as a missing snapshot does; every other failure (the gate's rejection, a `DossierError`, the emit guard, the file system) prints the same way and exits 1. No stack trace is printed. The screenshots are validated at their source (at least 3 images, the existing name rule) after the snapshot parses and before the model runs, so nothing has been written when they fail. Stdout on a valid build is unchanged, including the dashboard file count.
3. **Snapshot parser strictness: fixed except one rule, which the sealed snapshot forbids.** Now a `SnapshotError`: a slug or name that is empty after trimming; an `mcap_usd` or `change_7d` that is present, not null and not a number (an overflowing literal such as `1e999`, which parses to Infinity, is included, since it used to become null as well); a duplicate watchlist slug. **Not applied: rejecting a negative `mcap_usd`.** The sealed snapshot records `mcap_usd: -1` for one protocol (index 53, `autofinance`, a source sentinel beside a `gecko_id` and a symbol), so the rule would refuse the competition input. It was reverted; a negative figure passes through unchanged as before, and every consumer already reads a live token as `mcap_usd > 0`. No existing test fixture relied on any of the leniencies. The category, chains, `gecko_id` and symbol coercions are untouched.
4. **`runBacktest` parity: fixed.** It now takes the same factor decisions as `buildRadar` (`factorChangeReport`: fitted amplitudes and the derived unknown age, each only when adopted) and the `fixed_k_6` arm is its own `calibrateBacktest` with `dispersionShrinkage: false`. `calibrateBacktest`'s variants type gained that key; it already forwarded it. On the sealed snapshot the report now equals the build's `calibration_backtest` exactly:

   | figure | before | after |
   | --- | --- | --- |
   | unknown listed age (days) | 365 (model default, unreported) | 677 (derived) |
   | bias correction factor | 1.2681941174 | 1.2740248279 |
   | band width multipliers (category / global-anchored) | 1 / 0.99 | 1 / 0.99 |
   | all: median absolute log error | 1.2377683170 | 1.2377682774 |
   | category: median absolute log error | 1.2015216930 | 1.2015216975 |
   | global-anchored: median absolute log error | 1.3470031022 | 1.3470031034 |
   | `fixed_k_6` all: median absolute log error | 1.2463565246 | 1.3217881333 |
   | `fixed_k_6` global-anchored: median absolute log error | 1.3470031022 | 1.3470031283 |
   | `fixed_k_6` bias correction factor | 1.2681941174 (borrowed) | 1.3738439858 (own) |
   | `fixed_k_6` band width multipliers | 1 / 0.99 (borrowed) | 0.99 / 0.99 (own) |

   Counts (128; 100 category, 28 global-anchored) and coverage (0.5 throughout) are unchanged, as is `measurements`. The dispersion-shrinkage advantage over fixed k = 6 reads larger once the fixed arm is calibrated on its own (0.084 in median absolute log error, where the borrowed calibration showed 0.009). Diagnostics only; the build does not read `runBacktest`.
5. **CLI argument parsing: fixed.** `option()` moved to `lib/infra/cli.ts` and takes the argument list, so a test reaches it. A flag followed by a token that starts with `--` has no value: the equals form is consulted, then the default. `--input --output /tmp/out` now reports no snapshot at `/input/snapshot.json` (exit 2) and writes nothing, where it used to read a snapshot named `--output`.
6. **Emit guard: added.** `emit()` walks `board` and `radar` before creating the output directory and throws a plain `Error` naming the path of the first non-finite number (for example `emit: radar.rows[1].model.base_usd is NaN, not a finite number`). No output change on valid data.
7. **Typecheck probe: ran; nothing in the reviewed code needed fixing.** TypeScript 7.0.2 from a scratch directory outside the repository (`noEmit`, `skipLibCheck`, `strict` off, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `module` and `moduleResolution` `nodenext`, `@types/node` installed in the scratch directory), over `main.ts`, `lib/app/runBacktest.ts` and `test/domain.test.ts` and everything they import. It reported three errors. One was in this batch's own watchlist check (a narrowing lost inside a callback) and was fixed before it landed. Two are left, both inference-level and neither a wrong property or argument count: `buildBoard.ts`'s `grade_backtest` is built with `Object.fromEntries`, which TypeScript types as a string-indexed object rather than `Record<'A' | 'B' | 'C', …>` (the three keys are present at run time); and a test callback annotates its parameter as `Record<string, unknown>` where the array holds `CalibrationEntry`. No file or dependency was added to the repository.
8. **`.gitignore`: appended** `.DS_Store`, `node_modules/` and `*.log`.

**Kept, with reasons.**

- `vendor/makefun-board.ts` is a byte-contract file and stays untouched. (Noted against the dossier's 64KB text limit: the review put the dashboard at about 41KB; after the follow-up fixes (7) its five files measure 48,553 bytes.)
- `collectFlatFiles` stays flat-only: the dashboard layout is flat by design, and the dossier builder's recursion does not define the layout.
- `gradeForBandRatio` stays imported from `backtest.ts`: moving it is churn without behavioural gain.
- `package.json` keeps `--experimental-strip-types`: the README's Node guidance covers the flag-free form, and the scripts must work on the widest range.

Tests added (6): the new parser rejections and the kept coercions; the sealed snapshot still parsing with its one negative `mcap_usd`; `option()`; the emit guard; `runBacktest` against `buildRadar` on a fixture; and against the sealed build's figures.

## radar-20 follow-up fixes (9)

From an external review: the research tools, this document and the test suite are brought in line with production. Production behaviour does not change: a fresh build of the sealed snapshot gives `board.json` sha256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` and `data.js` sha256 `a1690f13f03e6ad6dcbc84ee5291dacec7d7d9769ef9cff36d5e86d740f4fdba`, both unchanged. `main.ts`, `lib/app/buildBoard.ts` and everything `buildRadar` calls are untouched except for one optional parameter on `measurementReport`, which the build does not call. The suite goes from 62 to 67 cases (5 added, none edited).

**1. Tools run under production's factor settings and share one default input.**

- *What was misaligned.* None of the tools calls `buildRadar`; they call `calibrateBacktest`, the function `buildRadar` evaluates its calibration backtest with. `tools/loo-contests.mjs` and `tools/sensitivity.mjs` called it without `derivedUnknownAge`, so every arm ran at the model-default unknown age (365 days) where production runs at the derived age (677 days on the sealed snapshot, refit per fold). `tools/backtest.mjs` goes through `runBacktest`, which batch 10c had already aligned for its headline figures, but `measurementReport` inside it still ran its W0/W1/P0/P1 arms at 365 days.
- *Fix.* A new `tools/_snapshot.mjs` holds `productionVariants(snapshot)`: the two decisions `buildRadar` takes from `factorChangeReport` (fitted amplitudes and the derived unknown age, each only when adopted), in the shape `calibrateBacktest` accepts. Both tools spread it into every arm, and print it as `settings` in their output. It follows the adoption decision instead of hardcoding `derivedUnknownAge: true`, so the tools stay aligned on a snapshot where the derived age is not adopted. `measurementReport(snapshot, variants = {})` takes the same pair and `runBacktest` passes its own; the default is the previous behaviour.
- *Checked and left unchanged.* `tools/radar20-contests.mjs` already runs at the derived age (it sets `derivedUnknownAge: true` by design: its arms contest amplitudes and bias at production's age) and only its input default changed; its output on the sealed snapshot is byte-identical before and after. `tools/backtest.mjs`'s headline figures (everything outside `measurements`) are byte-identical.
- *Default input.* The defaults were three different paths, two of which do not exist here (`/input/snapshot.json` in three tools, `input/snapshot.json` in `sensitivity.mjs`, `snapshot.json` in `backtest.mjs`). Every tool, `adaptability.mjs` included, now reads its first argument when given and otherwise the kit snapshot, resolved relative to the repository (`../token-radar-01-kit/input/snapshot.json`), and exits 2 with a one-line message when the file is missing.
- *Figures, sealed snapshot, before → after the alignment* (median absolute log error unless noted):

  | Tool, arm | 365 days (before) | production settings (after) |
  |---|---:|---:|
  | loo-contests S0 = G0 | 1.2377683170 | 1.2377682774 |
  | loo-contests S1 adjusted global | 1.3329621716 | 1.3329621793 |
  | loo-contests S1, category basis | 1.19225 | 1.19491 |
  | loo-contests S0 mean absolute error, category / global-anchored | 1.56087 / 1.74802 | 1.55943 / 1.74931 |
  | loo-contests sparse mean band ratio G0 / G1 / G2 | 11.7580 / 13.8083 / 13.4323 | 11.6839 / 13.8083 / 13.4078 |
  | sensitivity baseline and all five winsor arms | 1.2377683170 | 1.2377682774 |
  | sensitivity shrink clamp 1–12 | 1.2404148738 | 1.2369008255 |
  | sensitivity shrink clamp 4–48 | 1.2906219341 | 1.2906219097 |
  | sensitivity global exclusions: none | 1.2785382371 | 1.2605529278 |
  | sensitivity size fit: all live peers | 1.3645842171 | 1.3465989913 |
  | backtest `measurements` W0 = P0 | 1.2377683170 | 1.2377682774 |
  | backtest `measurements` W1 (kernel) | 1.3427709512 | 1.3427709493 |
  | backtest `measurements` P1 (single-peer blend), all / global-anchored | 1.2297598974 / 1.236786 | 1.2297598993 / 1.218801 |
  | backtest `measurements` P1_proxy, P0 / P1 (16 rows) | 1.2180046 / 1.0843044 | 1.2180046 / 1.0663191 |

  Coverage is unchanged in every arm (0.5 overall; S/G sparse 0.5294 / 0.5882 / 0.5882; G1 0.5078, G2 0.4766; proxy 0.625 / 0.5625). The aligned baseline now equals the build's `calibration_backtest` to the last digit. No verdict changes: S1, G1, G2, W1 and every sensitivity variant still lose to the current setting or fail their gate, with one reading worth stating plainly: the shrink clamp 1–12 arm is now marginally *below* the baseline (1.2369 against 1.2378, a gain of 0.07% where 3% is required), where at 365 days it was marginally above. P1 remains 0.6% better than P0 overall, as before, far short of an adoption margin. The "radar-12c measured sensitivity" table above is kept as recorded (it predates the radar-20 normalization fix); the figures here are the current ones.
- *Report.* `tools/loo-contests-report.md` (the report lives in `tools/`, not `docs/`) gains a section with the aligned S and G tables and a note that the gap between its radar-19 baseline (1.23736) and its radar-20 baseline (1.23777) mixed two differences: the normalization fix, +0.00041 with the age held at 365 days, and the age setting, −0.00000004. Its radar-19 tables are kept and labelled as pre-fix, 365-day measurements. The absolute snapshot path in its first line is now repository-relative. The radar-19 G2 overall coverage (0.4844) against the current 0.4766 is the normalization fix, not the age: the tool gave 0.4766 at 365 days too.

**2. `tools/adaptability.mjs` asserts what it probes.** Three defects fixed. (i) The child process is spawned with `--experimental-strip-types`. (ii) The hardcoded `const rejection = null` is gone: each case is built in-process with `buildRadar`, whose `rejection` is reported and checked, and the CLI child must agree with it (exit 0 and a `board.json` / `data.js` deep-equal to the in-process board and radar when the gate accepts; exit 1 naming the rejection and no board written when it refuses). (iii) It asserts, and exits 1 when any assertion fails. Cases and properties, on the sealed snapshot (78 assertions, all pass):

- *Every case:* implied values are positive safe integers and non-increasing down the board, ranks are 1..n, bands and rank ranges hold their point values, the unknown age in use is the derived median or the model default.
- *Scale ×2 and ×1000 (every TVL and market cap):* ranks unchanged (same slugs in the same order), rank ranges and grades unchanged, size slope, band multipliers and unknown age unchanged, bias factor unchanged to 1e-6, every implied value and band end scaled by the constant. The value comparison carries a stated tolerance and is not exact: values are whole dollars, and the bias factor is fitted on leave-one-out predictions that are themselves rounded to whole dollars, so it moves in the eighth significant digit (1.2740248279 → 1.2740248424 at ×2). The largest relative deviation of an implied value is 3.0e-7 (tolerance 1e-6 plus the half-dollar rounding).
- *Time +180 days (`as_of` moved forward):* the same 198 protocols are scored; every known age grows by exactly 180 and unknown ages stay unknown; the derived unknown age grows by exactly 180 (677 → 857) and is still adopted; the size slope and every growth multiplier are bit-identical; ratios of maturity multipliers match the M1 curve at the shifted ages; the maturity spread across the board does not widen. The top 20 is unchanged on this snapshot, which is reported and not asserted, since how far a perturbation moves the board is the measurement.
- *Remove the largest category (Dexs, 99 protocols):* no protocol or calibration entry of that category remains, every remaining watchlist protocol is on the board (39 of 39), and the gate still accepts (177 rows; 19 of the base top 20 remain, reported and not asserted).

  The failing path was exercised with a temporary copy that scaled TVL only: 2 assertions failed and the process exited 1. The copy is not kept.

**3. Corrections to this document.** (a) The class (d) heading and the count note said 15 entries; the table has 16 rows and the stated total of 31 already assumed 16 (6 + 5 + 4 + 16). Both now say 16. (b) The "Growth center fallback" row described a zero median change in the backtest's factor normalization. That was fixed in "radar-20 follow-up fixes": `factorNormalizers` takes the fold's `calibrate().medianChange` (`backtest.ts:287`), the value `estimate()` is scored with. The row now describes the code as read: the shipped G2 shape centres on percentile 0.5 and ignores the median change entirely; a missing `change_7d` takes percentile 0.5 and so a neutral multiplier of 1, on the board and in the backtest alike; the median change centres only the rejected G1 shape; the observed median fills a missing `growth_pct` for display; `MODEL.growth_median_change_7d: 0` is a placeholder that `buildRadar` overwrites with the observed median. One literal 0 remains, in `fitFactorAmplitudes`' `growthFactor('G2', …, 0, …)` call: it is inert because G2 ignores the argument, and it is left as is. (c) Found in the same table and corrected, though not on the review's list: "Dashboard shortlist sizes" said 5 where batch 9 made it 6 (`dashboard/state.js:38`). Other line references in the inventory tables were not re-verified in this batch and may have drifted.

**4. Tests added (5).**

- (a) *Farm plan contract* (`test/domain.test.ts`). `farmSteps()` over twelve categories covering every action branch (lending, DEX/swap, perps/derivatives, yield/staking, bridge, other, and no category) and every risk branch, four protocol shapes (plain, no chains, eight chains, a 300-character name on a 200-character chain) and five ages: every plan has 3–12 steps and every published step string is 20–600 characters; the branch's own action and risk wording and the 4- or 8-week span are checked; the 600-character cut and the 20-character padding in `stepText` are each exercised; every row of a built board is checked against the same contract.
- (b) *CLI end to end* (`test/integration.test.ts`). `main.ts` runs as a child process on a synthetic 122-protocol snapshot into a temporary directory: exit 0, empty stderr, `board.json` (110 rows, ranks 1..110), `data.js`, `dossier.json` and a `dashboard/` holding exactly the source dashboard's files. A stale file is then placed in the output dashboard and the build re-run: the file is gone, the dossier does not name it, and all three outputs are byte-identical to the first run. A missing snapshot path exits 2 with exactly one line on stderr (`token radar: no snapshot at …`), no stack trace, empty stdout and no output directory.
- (c) *Amplitude adoption path* (`test/integration.test.ts`). A synthetic case where the fitted arm wins **was constructed**; no fallback assertion was needed. 36 live peers carry market caps that follow the model's own G2 and M1 shapes raised to planted amplitudes (4, 5) with a ±5% deterministic disturbance. `factorChangeReport` adopts (overall median absolute log error 0.275 fitted against 0.779 fixed; halves 0.235 / 0.302 against 0.585 / 0.902), every overall and half-split figure of all three arms is finite, the full-sample fit recovers (3.95, 4.52), and `buildRadar` on the same snapshot, with no injected report, emits those amplitudes in `fitted_factor_amplitudes` and in `factor_normalization`, passes the emit guard, and builds a board whose growth spread is the adopted exponent times the (1, 1) board's. This is the path that read the nonexistent `summary.first_half` before batch 10a: it throws there. A control case plants (1, 1) and is not adopted.
- *Measurement parity* (`test/domain.test.ts`, for item 1). `runBacktest`'s `measurements.contest.W0` equals the reported model's summary, equals `measurementReport` under the build's decisions, and differs from the model-default arm on a fixture that adopts the derived age.

**Not changed, noted.** `README.md`'s run line (`--input snapshot.json`) names a file that is not in this repository; it is the entry's public instruction and was outside this batch. The tools' default path assumes the kit is checked out beside this repository, as the sealed-snapshot tests already do.

## radar-20 follow-up fixes (10)

Two items left open by earlier batches, both approved for this one. No figure changes: `board.json` keeps SHA-256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`.

**1. `statistics_label` says what was computed.** Closes the item flagged in "radar-20 follow-up fixes (6)". `calibrate()` emitted `statistics_label: 'raw set statistics'` on every calibration entry. That holds for the global entry, whose logs are raw market-cap/TVL log ratios winsorized to their own p1–p99 range. It did not hold for the category entries: their `median_ratio`, `p25_ratio` and `p75_ratio` are computed from log ratios that have had the fitted TVL size adjustment applied and are then winsorized to the global range.

- *Wording.* Category entries now carry `'size-adjusted set statistics'`; the global entry keeps `'raw set statistics'`. "Size adjustment" / "size-adjusted" is the phrase this codebase already uses for that step (README: "A fitted TVL size adjustment"; this audit: "category logs size-adjusted, global logs not"; the test names). Winsorization is not named in the label because it does not distinguish the two: both sets are winsorized, and the global entry was already called "raw" with it applied. The label therefore marks the one thing that differs.
- *Derived, not fixed.* The label follows the computation and is not a constant per entry kind (`calibration.ts`): category entries read `'size-adjusted set statistics'` only when a size adjustment is passed to `calibrate()`, and the global entry reads it only under `adjustGlobal` (the rejected S1 arm, off in production). `calibrate(snapshot)` with no adjustment still labels everything raw, which is then true. `CalibrationEntry.statistics_label` is typed as the union `StatisticsLabel` (`types.ts`).
- *Where the string lived.* Only `lib/domain/calibration.ts` (two literals) and `lib/domain/types.ts` (the type). No test pinned it, the dashboard does not render or read it, and no method text quotes it; the kit carries no schema for it. Nothing else needed to change.
- *Test added (1, 68 in total).* `statistics_label states whether an entry was computed from size-adjusted log ratios`: all-raw with no adjustment; size-adjusted categories and a raw global under the production call, with the category median differing from and the global median equal to the unadjusted run; both size-adjusted under `adjustGlobal`.
- *Output check.* Rebuilt from the sealed kit snapshot and compared with the `data.js` saved before the change: 34 `statistics_label` values changed (`raw set statistics` → `size-adjusted set statistics`, the 34 category entries), 1 unchanged (global). Substituting the old string back into the new file reproduces the old file byte for byte, so no number and no other field moved. `data.js` SHA-256 goes from `a1690f13f03e6ad6dcbc84ee5291dacec7d7d9769ef9cff36d5e86d740f4fdba` to `0b8754f609f46121fcd2cd59dcae872d8ac8588b43d9b05a47741b5ce28e8bc4`.

**2. README run line.** Closes the note in "radar-20 follow-up fixes (9)". The run line named `--input snapshot.json`, a file this repository does not contain. It now reads `--input ../token-radar-01-kit/input/snapshot.json`: the kit checked out beside this repository, the same location `tools/_snapshot.mjs` defaults to and the sealed-snapshot tests look up. The rest of the README is unchanged. The command was run as written to produce the build verified above.

## radar-20 follow-up fixes (11)

The residual noted at the end of "radar-20 follow-up fixes (7)": tooltips near the right edge widen the page. Presentation only: `dashboard/app.css` and `dashboard/app.js` changed, nothing under `lib/`, `main.ts`, `test/` or `tools/`. `board.json` keeps SHA-256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` and `data.js` keeps `0b8754f609f46121fcd2cd59dcae872d8ac8588b43d9b05a47741b5ce28e8bc4` after a rebuild.

**Defect, as measured.** Headless Chromium (the Playwright install the screenshots use), sealed `data.js`, detail open, disclosures open: 231 `.info-tip` markers, each bubble 322px wide. The bubble (`.info-tip::after`) was centred on its marker and is laid out even while transparent, so the page was wider all the time, not only while a tip was shown: `scrollWidth` 1398 at a 1280px viewport and 1142 at 1024px, 118px too wide in both. Three groups crossed the right edge:

| Tips | Count | Past the right edge at 1280px | at 1024px |
| --- | --- | --- | --- |
| Chart rows (Top 20 by implied value), grade tip | 20 | 118px | 118px |
| Start-here shortlist, grade tip, right-hand column | 2 of 6 | 103px | 103px |
| Board rows, grade tip | 198 | 105px | 133px |

The chart and shortlist tips set the document width. The board-row bubbles sit inside `.table-wrap`, which scrolls, so they were cut off at its edge. The three detail tips (grade, growth and maturity multiplier) sit at the left and did not overflow at these widths, contrary to the earlier note; at 760px and below the maturity tip crossed the left edge by 3px. The header tip, the Tokenized peers header tip and the two `.info-tip-right` tips were inside.

**Fix.** The bubble's horizontal position is now `left: var(--tip-x, auto); right: 0`, and its transform only carries the 3px rise, so the fade is unchanged. `placeTip` in `app.js` runs on `mouseover` and `focusin` for a tip, measures the bubble, and sets `--tip-x` so the bubble is centred on its marker (ending at the marker for `.info-tip-right`, as before) and then moved in by whatever it would otherwise cross of the page column (`.page` inside its padding). A bubble that already fitted inside the column lands where it did before; the detail's maturity tip, which reached into the left page padding, moves 15px right. Until a tip is first shown its transparent bubble rests with its right edge on the marker, which cannot extend the page to the right; the `.info-tip-right` CSS rules of fix H are gone because that is now the resting rule, and the class remains as the alignment preference `placeTip` reads. A window resize clears the stored positions. No `overflow-x: hidden` is involved, and no bubble is clipped.

**Verification.**

- Same measurement after the fix: for all 231 tips the bubble box after the pointer event lies inside the viewport (0 crossing either edge) at 1280, 1024, 760 and 390px. 45 tips per width (every tip outside the board rows, and 12 board rows) were also really hovered and then focused: the bubble was opaque each time and `scrollWidth` equalled the viewport width throughout (1280/1280, 1024/1024, 760/760, 390/390). `.table-wrap` gains no scroll width from the bubbles.
- `npm test`: 68 tests, all pass.
- The five dashboard files measure 49,814 bytes (48,553 before), under the 64KB limit; none contains an `http` URL.
- The four screenshots were regenerated the usual way (1440×900, from `out/dashboard/` after a rebuild) and came out byte-identical, since none shows an open tooltip. A second build copied them into `out/`.

## radar-20 follow-up fixes (12)

Three presentation changes to the dashboard. `dashboard/components.js`, `dashboard/app.css` and `dashboard/app.js` changed, plus one test in `test/domain.test.ts` that reads the method copy; nothing under `lib/`, `main.ts` or `tools/`. `board.json` keeps SHA-256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` and `data.js` keeps `0b8754f609f46121fcd2cd59dcae872d8ac8588b43d9b05a47741b5ce28e8bc4` after a rebuild.

**A. Method copy split.** The "Model and calibration" copy was one 26-sentence paragraph. It is now a lead paragraph and five headed subsections, still inside one `.method-copy` node (a `div` holding `p` and `h3`, where it was a single `p`):

| Part | Sentences, in the order shown |
| --- | --- |
| Lead (ink, red rule at the left) | validation by leave-one-out; what the band is; overall coverage and median absolute log error |
| Basis and centre | size slope; bias correction; calibration centre; linear size adjustment · winsorization; single-peer categories; tokens never ranked; zero market caps and the excluded categories |
| Growth, maturity and peer share | growth percentile; factor normalization; fitted amplitudes (when adopted); unknown listing age; peer share |
| Bands and coverage | board median band ratio; band multipliers per basis; coverage per basis |
| Rank quality | Spearman and top-10 overlap; top-10 bias and selection shrink · rank ranges; wide ranges; top-20 jackknife |
| Grades | grade rules; why peer support stays in the grade · what each grade carried in backtesting |

The sentences were moved, not rewritten: every one is still built by the same expression from the same data fields, and the lead is three of the original sentences, so no figure appears twice and none was added. The only character change is one doubled space before "Peer share", now single.

- *Check.* The rendered text of the copy was saved from the batch-11 dashboard and from this one (headless Chromium, sealed `data.js`), split into sentences and compared as sorted lists: 26 sentences before, 26 after, identical.
- *Test adapted.* `dashboard method text names the unknown-age source truthfully, adopted or not` read `textContent` of the one paragraph; it now joins the text of the copy's children. Two of its assertions pinned the grade sentence by the sentence that used to follow it ("… C carried 0. Each rank"); "Each rank" now sits under Rank quality, so they assert instead that the grade sentence ends the copy (`endsWith`), which is the same claim about where that sentence stops. No assertion was dropped.

**B. Shortlist marker on board rows.** A board row whose protocol is one of the Start-here cards carries a small outlined `SHORTLIST` tag (`.short-tag`) in the protocol cell, beside the `WATCHLIST` tag where the row has both. Same 9px mono caps and accent colour as `.watch`; `.watch` became a flex row so the two sit side by side on one line. The set comes from the `shortlist` the view already computes in `state.js`, so the cards and the tags cannot disagree. Rows in neither list are unchanged.

- *Check.* On the sealed data the six tagged rows are the six cards, in the same order: OnRe (rank 5), OpenTrade (7), Plume Vaults (8), R25 (9), Lofty (12), BitFi Basis (13); the first five also carry `WATCHLIST`. Sorting by TVL and searching "on" leaves 22 of 198 rows with the one matching shortlist row still tagged, and clicking it opens its detail (OnRe): sorting, filtering and opening are untouched (`state.js` is unchanged).

**C. Rank–value curve.** New section "Value by rank" (`curve()` in `components.js`), placed between the Start-here shortlist and the Ranked board: the shortlist stays the first thing read, and the curve then introduces the table by showing the whole board at once. Page order is header, shortlist, curve, board, detail, top-20 chart, method, live set.

- *Content.* Implied value against rank for all 198 board rows on a log y-axis; `value_low_usd` to `value_high_usd` per row drawn as a soft red area behind the ink line; the six shortlist rows marked with red dots. Gridlines and labels at each power of ten inside the data range, which for this snapshot is $1M, $10M and $100M (bands span $518K to $422M); rank labels at 1, 50, 100, 150 and 198. Captions "Implied value · USD · log scale" and "Rank" in the mono caps style of the table headers.
- *How it is drawn.* One inline SVG built from `RADAR.rows`, the data the board already uses; no library, no network, no asset. The SVG has a 0–100 `viewBox` stretched to the column with unscaled strokes, and the axis text is HTML positioned over it by percentage, so the text keeps its size at every width and the plot has no fixed pixel width. The first and last rank labels are aligned to the plot's ends so neither reaches past it. The y-range is taken from the rows (with 4% padding), not fixed. The plot is static: it has no hover state and is not affected by the board filters.
- *Accessibility.* The plot is `role="img"` with a label giving the top and bottom values and the band range.

**Verification.**

- `npm test`: 68 tests, all pass.
- Overflow, `/tmp/tipcheck/measure.mjs` (headless Chromium, detail and disclosures open) at 1280, 1024 and 390px: 231 tips, 0 bubbles crossing the viewport, `scrollWidth` with a tip shown 1280/1280, 1024/1024 and 390/390; `.table-wrap` gains no scroll width. The curve on its own: `scrollWidth` equals the viewport at 1440, 1280, 1024 and 390px, and its labels lie between x=40 and x=1248 at 1280px, 40 and 992 at 1024px, 20 and 378 at 390px, inside the page column each time. No page or console errors.
- The five dashboard files measure 54,792 bytes (49,814 before, +4,978), under the 64KB limit; none contains an `http` URL.
- The four screenshots were regenerated the usual way (1440×900, from `out/dashboard/` after a rebuild) and viewed: `1-board.png` now shows the curve between the shortlist and the board, and `4-calibration.png` the lead and the first subsections. `2-detail.png` and `3-filtered.png` frame the open detail and the end of the board with the top-20 chart, which this batch did not alter beyond their position on the page. The tagged rows (ranks 5–13) and the full method copy fall outside those four frames and were checked in separate captures. A second build copied them into `out/`; both hashes above were read after it.

## radar-20 follow-up fixes (13)

The "Value by rank" section added in "radar-20 follow-up fixes (12)" pushed the board table below the fold at 1440×900. This batch makes the section shorter. Presentation only: `dashboard/app.css` and one statement in `curve()` in `dashboard/components.js` changed; nothing under `lib/`, `main.ts`, `test/` or `tools/`. `board.json` keeps SHA-256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` and `data.js` keeps `0b8754f609f46121fcd2cd59dcae872d8ac8588b43d9b05a47741b5ce28e8bc4` after a rebuild.

**Before, as measured.** Headless Chromium at 1440×900, sealed `data.js`, page unscrolled. From the bottom of the shortlist to the bottom of the "Rank" caption the section took 258px (30 margin, 34 heading, 12 gap, 11 + 6 y-caption line, 132 plot, 1 axis, 22 + 11 rank labels and caption). The "Ranked board" heading was at y=754, the table header at 910–951 and the first row at 951–999: the heading was visible, the table header and every row were not.

**Change.**

| Part | Before | After |
| --- | --- | --- |
| Plot height (`.curve-plot`) | 132px | 88px |
| y caption "Implied value · USD · log scale" | its own line above the plot (17px) | inside the plot, top-right corner (0px) |
| x caption "Rank" | its own line under the rank labels (15px) | on the rank-label line, in the y-axis gutter left of "1" (0px) |
| Gap above the section heading | 30px | 22px (the shortlist's own bottom margin) |
| Heading rule to plot | 12px | 10px |
| Axis to rank labels | 7px | 5px |
| Plot bottom margin | none (caption line, then the board heading's 30px) | 33px, of which the rank labels use 15 |

The captions are now children of the plot box, positioned like the tick labels, which is why they cost no height. The top-right corner is free on this data: the band falls with rank, and the caption clears it at 1440, 1280, 1024 and 390px (viewed at 1440 and 390). Content is unchanged: 198 points on the line, the low–high band, six shortlist dots, gridlines and labels at $1M, $10M and $100M, rank labels 1, 50, 100, 150, 198, both captions with the same wording, the same `aria-label`. The y scale is computed as before; only the pixel height it maps to changed, so a decade is 27.7px tall instead of 41.7px, and the 10px tick labels sit 17.7px apart edge to edge.

**Result.** Shortlist bottom to the bottom of the rank labels: 168px (258 before); the section's own box is 132px (228 before). The "Ranked board" heading moved up 101px to y=653, the table header to 809–850, and row 1 to 850–898, so the heading, the filter bar, the grade strip, the table header and the first row are above the fold; row 2 starts at 898. Rows fully visible at 1440×900: 1 (0 before).

**What was not reached.** The aim was the first few rows. Between the board heading and the first row sit 197px of filter bar, grade strip and table header, which this batch does not touch, so showing three rows would need the curve section to shrink by 199px, to about 59px in all including its heading, and two rows by 149px; neither leaves a plot. One row needs 99.5px and was taken with 1.75px to spare. A 76px plot was also tried and viewed: it could not bring in a second row, and the curve read as a strip, so 88px was kept.

**Verification.**

- `npm test`: 68 tests, all pass.
- Overflow: `/tmp/tipcheck/measure.mjs` was no longer present and was rewritten to do the same thing (headless Chromium, detail and disclosures open, every tip given its pointer event, all bubbles then forced opaque). At 1440, 1280, 1024 and 390px: 231 tips, 0 bubbles crossing the viewport, `scrollWidth` with the tips shown 1440/1440, 1280/1280, 1024/1024 and 390/390; 45 tips per width were also really hovered with `scrollWidth` unchanged throughout; `.table-wrap` gains no scroll width. The curve's labels and captions lie between x=40 and x=1248 at 1280px, 40 and 992 at 1024px, 20 and 378 at 390px, the same extents as before. No page or console errors.
- The five dashboard files measure 55,015 bytes (54,792 before, +223), under the 64KB limit; none contains an `http` URL.
- The four screenshots were regenerated the usual way (1440×900, from `out/dashboard/` after a rebuild) and `1-board.png` was viewed: it now ends on board row 1 (Sentora Curator). A second build copied them into `out/`; both hashes above were read after it.

## radar-21 validation and integrity batch (pipeline)

Pipeline only. The dashboard files are untouched; `out/data.js` gains four objects (`validation`, `launchContext`, `farm_assumptions`, `audit`) and one field per row (`farm_economics`). No estimate, rank, band or grade changes: `out/board.json` is byte-identical (SHA-256 `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`). Every figure below is computed from the sealed snapshot at build time; no metric value is written in source.

**1. Validation of the shipped model (`validation`, `lib/domain/backtest.ts`).** The LOO fold body was extracted into `observePeer`, shared by `backtest` and the new walk-forward test, so both score the same procedure. The metric throughout is the median over peers of |ln(predicted market cap / actual market cap)|, all 128 tokenized peers, no clamping; the factor is e^metric.

| Measure | Value | Factor |
| --- | --- | --- |
| LOO, shipped model (the build's own calibration backtest) | 1.2378 | ×3.45 |
| LOO, strict (size slope refit per fold, bias correction from the other peers) | 1.3191 | ×3.74 |
| Walk-forward (95 dated peers, split 2024-02-18, train 48, test 47; 33 undated peers in neither half) | 0.9702 | ×2.64 |

The shipped LOO refits calibration sets and factor normalizers without the held-out peer but keeps two full-sample constants, the size slope and the median bias correction. The strict row removes both and is 0.081 worse; it is published beside the headline rather than instead of it. The walk-forward fit takes every quantity (slope, calibration, bias correction, residual quantiles, band multipliers) from the earlier half only; its median signed error is −0.058 and its band coverage 46.8% against a nominal 50%. The walk-forward error is lower than the LOO error because it is scored on 47 dated peers, not on all 128, so the two are not comparable as a ranking of procedures.

Coverage of the shipped low–high band (nominal 50%): 64 of 128 = 50.0%. That figure is in-sample, since the band quantiles and width multipliers are tuned on these residuals; scored against the other peers' residual quantiles it is 62 of 128 = 48.4%. The model stores only the 25th and 75th residual percentiles, so the wider band is built from the same residuals at the 10th and 90th (nominal 80%, not shown on the board): 102 of 128 = 79.7% in-sample, 101 of 128 = 78.9% held out.

Ablation, same LOO metric, same 128 peers, each model variant recalibrated on its own:

| Variant | Median abs log error | Factor | vs full |
| --- | --- | --- | --- |
| (a) Full shipped model | 1.2378 | ×3.45 | — |
| (b) Plain log-log OLS, ln(mcap) on ln(TVL) | 1.2234 | ×3.40 | −0.0144 (beats full) |
| (c) Without the growth factor | 1.3079 | ×3.70 | +0.0702 |
| (d) Without the maturity factor | 1.2630 | ×3.54 | +0.0252 |
| (e) Without the size adjustment | 1.5130 | ×4.54 | +0.2753 |
| (f) Category medians only | 1.5876 | ×4.89 | +0.3498 |

The OLS line beats the full model by 0.014 and the row says so (`beats_full: true`). Each of the three components earns its place against the model without it; the size adjustment carries most of the gain.

**2. Launch context (`launchContext`, new `lib/domain/launchContext.ts`).** All 758 protocols by age since `listed_at` (365-day years, lower bound inclusive); a token record is a market cap, symbol or Gecko ID in the snapshot. Protocols without `listed_at` form their own band so the bands partition the snapshot.

| Band | n | With token record | Share | Board rows in band |
| --- | --- | --- | --- | --- |
| <1y | 160 | 52 | 32.5% | 80 |
| 1-2y | 183 | 70 | 38.3% | 76 |
| 2-3y | 139 | 76 | 54.7% | 24 |
| 3-5y | 155 | 123 | 79.4% | 9 |
| 5y+ | 8 | 6 | 75.0% | 2 |
| unknown | 113 | 89 | 78.8% | 7 |

This is a cross-section, not a launch probability (right-censored, and `listed_at` is not a token date). It is emitted with that label and is read by nothing in `estimate.ts`, the ranks or `board.json`.

**3. Farm economics (`farm_assumptions`, `rows[].farm_economics`, `lib/domain/farmplan.ts`).** The snapshot holds no gas price, time or wage, so these are named assumptions in `FARM_ASSUMPTIONS`: gas per step by primary chain (`CHAIN_GAS`; before fix 38, a flat $1–$8), 15 minutes per step, time valued at $30/hour, and for the break-even a 10% airdrop share of launch value allocated pro rata to plan capital over TVL. Per plan: step executions = six one-off steps + one visit per activity week (10 or 14), hours 2.5 or 3.5, cost = gas + time = $85–$155 (4-week plans) or $119–$217 (8-week plans); plan capital is working capital, not a cost. Two break-evens are emitted: the launch value at which a pro-rata allocation repays the cost, and the cost as a share of the row's implied value (no allocation assumption). Under the pro-rata rule no row breaks even: the lowest break-even is $85.1M and all 198 implied values are below their own. As a share of implied value the high cost is between 0.0002% and 0.0092%. `farmTotals`, the step texts and the existing `plan_*` fields are unchanged. The repository has no verdict logic; none was added.

**4. Integrity audit (`audit`, new `lib/domain/audit.ts`).** `eligibility.ts` now exports `exclusionReason`, the first rule a protocol fails, and `isRankable` is defined through it (same behaviour). Total 758 = 416 with a token record (128 calibration peers + 288 without a usable market cap) + 342 pre-token. Pre-token 342 = 198 ranked + 144 excluded: 128 derivative or exchange category, 11 versioned duplicate name, 5 wrapped or staked product name. No pre-token protocol is cut by a TVL floor or the row limit, and none has zero TVL: every rankable one is on the board. Watchlist required 40, present 40, both counted.

**5. Tests.** 76 pass (68 before, 8 new): walk-forward split on a fixture; walk-forward leakage (tripling later-half market caps shifts the error by exactly −ln 3); residual band coverage on a fixture; OLS and category-median baselines on exact fixtures; age bands and their partition; farm cost arithmetic; audit sums on a fixture; and a sealed-snapshot test tying the published LOO to the build's calibration backtest and the bands and audit to the 758 total.

**6. Outputs.** `out/board.json` `089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f` (unchanged); `out/data.js` `eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92` (566,988 bytes, 472,385 before); `out/dossier.json` unchanged, since the dossier does not include `data.js` and the dashboard does not yet read the new objects.

## radar-21 validation and integrity batch (dashboard)

Dashboard and README only. No file under `lib/` or `main.ts` changed; `out/board.json` (`089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`) and `out/data.js` (`eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92`) are byte-identical to the pipeline batch. Every number the new elements print is read from `data.js`; none is written in dashboard source.

**1. Validation section (`UI.validation`, `dashboard/components.js`).** A section between the top-20 chart and "Model and calibration", always open. Four tiles from `validation`: leave-one-out ×3.45 (1.2378, all 128 tokenized peers, unclamped), strict leave-one-out ×3.74 (1.3191, slope and bias refit per fold), walk-forward ×2.64 (0.9702, 95 dated peers split at 2024-02-18, 48 train, 47 test) and held-out band coverage 48.4% (62/128) for the nominal-50% band, 78.9% (101/128) for the nominal-80% band. Below them the six-row ablation table; a row with `beats_full` says so in its last cell and in the sentence under the table ("Plain log-log OLS: ln(mcap) on ln(TVL) beats the full model by 0.0144."), followed by the reading of the table: the size adjustment carries the model, growth and maturity help modestly, a plain curve is within noise. That reading is fixed text and describes the sealed snapshot. The section's subtitle states that the figures are computed at build time from the sealed snapshot for the exact model the board ships.

**2. Audit strip.** One line in the header under the title and the three counters, from `audit`: "758 scanned = 416 tokenized + 342 pre-token · 198 ranked · 144 excluded (128 derivative or exchange category, 11 versioned duplicate name, 5 wrapped or staked product name) · watchlist 40/40". The reasons are the data's own strings.

**3. Launch context.** Each board row's existing tooltip (the grade tip in the value cell) gains a second line from `launchContext.rows[slug]`: the band, the share with a token record and the band's n, labelled "share of protocols this age that already have a token (cross-sectional share, not a launch probability; not used in the value or the rank)". The six-band table sits beside the ablation table with the same label. No board column was added (a test counts seven) and nothing in `state.js` reads the field, so no rank, value or sort order can depend on it. The tooltip bubble now uses `white-space:pre-line` so the two lines are separate.

**4. Farm view.** "What it takes" in the detail gains step executions, hours, the cost range (gas + time) and the cost as a share of the row's implied value, from `rows[].farm_economics`, and the line "Cost assumes gas $1-$8 per step (fix 38: per-chain fees), 15 minutes per step and time at $30/hour. These are assumptions, not snapshot data." built from `farm_assumptions`. The share is the field `break_even_share_of_implied_value_*`, which is cost ÷ implied value and carries no allocation assumption. The pro-rata break-even launch values (`break_even_implied_value_usd_*`) and the allocation rule are not shown anywhere; a test asserts the detail text has no "break-even" or "pro rata".

**5. First screen.** The audit line adds 22px to the header (14px line, 8px grid gap). It was taken back from the header's padding (`8px 0 20px` to `0 0 12px`) and the page's top padding (30px to 24px). Measured in headless Chromium at 1440×900 before and after: board heading at y=652.56, table header 808.75–849.75, row 1 849.75–898.25, identical to the previous batch. The audit line is one line at that width.

**6. Tooltips: one defect found and fixed.** The bubbles of tips inside the board table were cut off by `.table-wrap` (`overflow:auto` clips both axes): the two column-header tips almost entirely and row 1's partly. This predates the batch (3 clipped tips in the committed dashboard) and the longer row tooltip would have made it 5. `.table-wrap` now has 260px of top padding cancelled by a negative margin, so a bubble has room above the table inside the scroll container; `.controls` and `.grade-strip` are raised (`z-index:1`) so they stay clickable through that padding, and a hovered or focused body row is raised above them so its bubble is not painted under the strip. Checked with real clicks on the filters and a real hover on the strip's tip. Measured with detail and disclosures open at 1440, 1280, 1024, 760 and 390px: 231 tips, 0 bubbles crossing the viewport edges, 0 clipped by the table wrap, `scrollWidth` equal to the viewport each time, no page or console errors. The table's own horizontal scroll at 1024px and below (55, 275, 645px) is the same as before.

**7. Size.** The five dashboard files measure 59,947 bytes (55,015 before, +4,932), under the 63,000 limit; the dossier text is 60,365 bytes, under its 65,536 cap with every file whole. The calibration and live-token tables were moved onto one shared table builder and repeated percent formatting onto one helper to pay for part of the addition. No file contains an `http` URL.

**8. Tests.** 79 pass (76 before, 3 new, in the existing dashboard block of `test/domain.test.ts`): a byte guard on the dashboard total (≤ 63,000); the validation section renders every ablation row, the four tiles and the age-band table from the data object, on the fixture, on an edited copy of it (a changed factor and a renamed row flagged `beats_full` both appear in the output) and on the sealed data; and the audit line, each row's age-band tooltip line, the seven-column board and the farm economics rows and assumptions line, on the fixture and on all 198 sealed rows.

**9. Screenshots and README.** The four screenshots were regenerated at 1440×900 from `out/dashboard/` after a rebuild with `tools/shots7.mjs`, which is `shots6.mjs` with the fourth frame starting at the Validation section instead of "Model and calibration"; a second build copied them into `out/`. `1-board.png` shows the audit line and still ends on board row 1; `2-detail.png` shows the farm economics rows and the assumptions line; `4-calibration.png` shows the whole Validation section with the opened method text below it; `3-filtered.png` is unchanged. The four images total 509,751 bytes. The README gained a Validation section with the same figures and their definitions, the statement that the plain curve's leave-one-out error is within noise of the shipped model's and why the extra terms are kept, and the reason the cross-sectional token share is not used as a launch probability. `out/dossier.json` is `0734fecebeb907c769dbfec08f4b93fb80eece5b60523af041a1f844aeb67c1c`.

## radar-21 follow-up fix (14): curve and validation tiles side by side

Layout only (`dashboard/app.css`, `dashboard/components.js`). No file under `lib/` or `main.ts` changed; `out/board.json` (`089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`) and `out/data.js` (`eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92`) are byte-identical.

**1. Two-column row.** The full-width "Value by rank" curve read as stretched. `.curve` is now a grid of two columns (`61fr`/`39fr`, 36px gap; 744px and 476px at 1440). Left: the curve with unchanged content (all 198 rows, low–high band, six shortlist dots, ticks $1M/$10M/$100M, rank labels 1/50/100/150/198); no label collides at the narrower width, so no label was moved. Right: a "Validation" heading with the pointer "Out-of-sample checks, defined in the Validation section below." and the four headline tiles in a 2×2 grid, value plus one-line label each: leave-one-out ×3.45, strict LOO ×3.74, walk-forward ×2.64, band coverage held out 48.4%.

**2. One source for the tiles.** The tile items moved out of `UI.validation` into `valTiles(validation, parts)`; the Validation section calls it with the definitions (unchanged output), the first screen without them. Both read the same `data.js` `validation` object, so no number is written in dashboard source and the two places cannot disagree. The duplication of the four headline figures is intended. The full Validation section (tiles, ablation, age-band table, definitions) is unchanged.

**3. Heights.** A grid container does not collapse margins with its neighbours, so the first build pushed the board down 52px (the heading's 22px top margin and the plot's 33px bottom margin had collapsed into the adjacent 22px and 30px). The curve's heading margin is now `0 0 10px` and the plot's bottom margin 3px, leaving the spacing to the neighbours' own margins; the compact tiles (27px value, 9px row gap) fit the plot column's height. Measured in headless Chromium at 1440×900: the row is 135.19px tall at y=487.38, the same box the curve section had; board heading 652.56, table header 808.75–849.75, row 1 849.75–898.25, identical to the previous batch.

**4. Responsive and tooltips.** At 760px and below the grid is one column: curve first, tiles below (2×2), 36px apart; at 761px it is still two columns. Tile labels stay on one line at 1440, 1280, 1024, 760 and 390. Tooltip check with detail and disclosures open at those five widths: 231 tips, 0 bubbles crossing the viewport edges, 0 clipped by the table wrap, `scrollWidth` equal to the viewport, no page or console errors; the table's own horizontal scroll (55, 275, 645px) is as before.

**5. Size, tests, screenshots.** The five dashboard files measure 60,848 bytes (59,947 before, +901), under the 63,000 limit. 79 tests pass, none changed: the validation test inspects `UI.validation` alone and still finds four tiles there. Screenshots regenerated with `tools/shots7.mjs` after a rebuild and copied into `out/` by a second build: `1-board.png` shows the side-by-side row and still ends on board row 1; the other three frames came out byte-identical. `out/dossier.json` is `5b827e6feadabdf06aee165eada414de2dc4e4e8e46d201d2a53996a7026bade`.

## radar-21 follow-up fix (15): dossier trim and shortlist stat label

Dashboard only (`dashboard/app.css`, `app.js`, `components.js`, `state.js`) plus the byte guard in `test/domain.test.ts`. No file under `lib/` or `main.ts` changed; `out/board.json` (`089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`) and `out/data.js` (`eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92`) are byte-identical.

**1. Trim: 60,848 to 59,636 bytes by dead-code removal; 56,000 was not reachable.** The target was 56,000. Only code that could be shown dead was removed, with no minification, no comment about the model stripped and no visible content touched; that yields 1,212 bytes. The rest of the source is live text, markup builders and rules in use, so the remaining 3,600 bytes would have had to come from minifying or cutting content, which was out of bounds. What was removed:

- CSS, one selector that matches nothing in any view (`.short-item>.grade`: every grade chip is wrapped with its tip).
- CSS, declarations overridden by a later rule of equal specificity, so they never applied: `.shortlist-whisker`'s `display`, `align-items` and `gap` lose to `.whisker` further down the file. The stat line under each card is therefore centred, as it always rendered.
- CSS, declarations restating the value the element already has: defaults on a `div`/`span`/`details` (`border:0`, `background:transparent`, `border-radius:0`, `margin:0`), values inherited anyway (`color` on the grade chip, detail value and steps; `text-align`), a repeat of an earlier rule (`color`/`font: inherit` on header buttons, `width:100%` on the disclosure table, `font-size:12px` on the card stat line), `width` under a fixed `flex-basis`, `display:block` and `width:100%` on grid items that stretch anyway, `list-style-position` on a flex `summary`, `letter-spacing:0` where nothing inherited sets it, and the whole rule `.disclosure>:not(summary)` (zero side margins on children that have none).
- CSS, four declarations in the 760px block identical to the base rule, and `.curve .vals` listed beside `.vals` there although the base rule for it already wins.
- JS, never-read or unreachable code: `peerCounts` in `state.js` (built and returned, read nowhere), the no-data return in `compute` (`app.js` exits before any call when the data is missing), the run-once flag in `countHeaderStats` (called once, from `mount`), the bare-chip branch of `grade` (every call passes a tip), the zero case in `plain` (only reached for values that print with an exponent), the `precise` wrapper around `usd`, and the unused `controls` export.

Kept although they change nothing in Chromium, because they depend on a browser's own defaults or on static positioning rather than on this stylesheet: the form-control resets (`border-radius`, `margin`, `width` on buttons, inputs and selects), `vertical-align` on cells, `top` on absolutely placed labels, and `color-scheme`.

**2. Proof.** `tools/radar-deadcss.mjs find` lists selectors with no match and declarations whose removal changes no computed value; `tools/radar-propdiff.mjs` then compares the committed dashboard with the trimmed one node by node: every computed property of every element and of its `::before`/`::after`, its bounding box, its text and its attributes. Run at 1440, 1280, 1024, 761, 760, 431, 430 and 390px in five states each (board; row detail with both disclosures open; shortlist-card detail with the board sorted by TVL; grade C plus watchlist filter; a search with no match): 40 comparisons, 1,037 to 5,454 nodes each, 0 differing nodes. Hover, focus and the entrance animation are not in that comparison; no removed declaration is read by a `:hover`, `:focus` or animation rule.

**3. Shortlist stat label.** The card line read "$12.8M–$150M · 35.8% peers tokenized", which could be taken as the protocol's own launch odds. It now reads **"$12.8M–$150M · category 35.8% tokenized"**: the subject of the percentage is the category. The number is the same field (`peer_token_share`, formatted by the same one-decimal helper) in the same place on the card; nothing else on the card changed. The figure is TVL-weighted (share of the category's TVL held by protocols that already have a token), as the board's "Tokenized peers" column tooltip defines it. The card stat has no tooltip of its own, so there was no tooltip wording to change and the tip count stays 231.

**4. Fit, and the breakpoints it needed.** The card had less room than the brief assumed. At 1024px three columns leave 283.9px for the line and the old 37-character line used 266.5px, so only two more characters fit; the longer suggested wordings ("category peers already tokenized: 35.8%", 54 characters with the band) do not fit even at 1440px (382.7px, 53 characters). The old line also already overflowed its card at 761–968px, 431–626px and 320–325px (measured in 1px steps). The chosen line is 40 characters (288px), the shortest that names the category, and the shortlist's column breaks moved so it fits everywhere: three columns down to 1041px, two from 1040px to 673px (was 760px to 431px), one below (was 430px), and no side padding on the stacked cards below 349px. Swept from 320 to 1600px (1px steps to 1100, 20px above): the line is one line inside its card at every width, tightest slack 0.5px at 673px. At 1440, 1280, 760 and 390px the layout is unchanged: the node-by-node comparison against the committed dashboard shows only the six stat lines differing (text and width). At 1024px the shortlist is now two columns instead of three, which pushes the rest of that page down by one card row.

**5. Checks.** At 1440×900: board heading 652.56, table header 808.75–849.75, row 1 849.75–898.25, as before. Tooltip check with detail and disclosures open at 1440, 1280, 1024, 760 and 390: 231 tips, 0 crossing the viewport edges, 0 clipped by the table wrap, `scrollWidth` equal to the viewport, no page or console errors; table scroll 0, 0, 55, 275, 645px as before.

**6. Size, tests, screenshots.** The five dashboard files measure 59,739 bytes (59,636 after the trim, +103 for the label and the three media blocks; 60,848 before). The byte guard is now ≤ 60,000 (was 63,000). 79 tests pass. Screenshots regenerated with `tools/shots7.mjs` after a rebuild and copied into `out/` by a second build: `1-board.png` shows the new label on all six cards and still ends on board row 1; the other three frames came out byte-identical. `out/dossier.json` is `7d53cb8f8ab2e80aacfaca1fcbdce4976f487b8a9549d3163855b7940ad07f73`.

## radar-21 follow-up fix (16): first-screen space, tile direction note, shortlist legend

Dashboard only (`dashboard/app.css`, `app.js`, `components.js`, `state.js`). No file under `lib/`, `main.ts` or `test/` changed; `out/board.json` (`089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`) and `out/data.js` (`eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92`) are byte-identical.

**1. First-screen space: board rows 1 and 2 are both above the fold at 1440×900.** Measured in headless Chromium: board heading 599.38, table header 755.56–796.56, row 1 796.56–845.06, row 2 845.06–895.06 (was row 1 849.75–898.25, row 2 898.25–948.25). Everything from the board heading down moved up 53.19px. No font size changed and the shortlist cards are untouched (the grid is still 297px tall, each card and its text as before).

- Header area, 28.19px: page top padding 24 → 12px (12), `h1` top margin 5 → 2px (3), `h1` line height 1.1 → 1 at the same 52px size (5.19), header row gap 8 → 4px (4), header bottom padding 12 → 8px (4). The header now ends at 107 (was 135.19); the audit line is still one line.
- Curve row, 25px net of the new note: the gap above the row (Start here's bottom margin) 22 → 12px (10) and the gap below it (the board heading's top margin, a new `.board .section-head` rule) 30 → 14px (16); the row itself is 136.19px (was 135.19). Inside the row both headings' bottom margin is 6px (was 10). Plot column: plot 88 → 78px, bottom margin 3 → 18px, so the rank labels now sit inside the row instead of hanging 15px into the gap below (the old 30px gap was half label). Tile column: row gap 9 → 4px and the 27px values at line height 1 (was 1.1), 90.38 → 80px, which pays for the note (12px line + 4px margin) with the two columns ending level at 585.38.
- The brief's split was about 24 + 26; the measured split is 25 + 28.19, the extra 3px being the margin that leaves row 2 ending 4.94px above the fold.
- The curve at 78px keeps the band, the three log-scale labels ($100M, $10M, $1M), the rank labels 1, 50, 100, 150, 198 and both captions; nothing overlaps.

**2. Direction note under the tiles, both places, same sentence:** "Smaller error is better; coverage is measured against a nominal 50%." It is one `p.peer-detail` (the existing muted 11px mono caption style) built by one function, `valNote`, placed under the 2×2 grid beside the curve and under the four headline tiles in the Validation section; the 50% is read from `validation.coverage.bands[0].nominal_coverage`, not typed in. The sentence is 67 characters because the first-screen tile column is 475.8px wide at 1440 and 460.2px at 1280, which holds 72 and 69 characters of this face; the longer wording with "band coverage … its nominal 50%" (77 characters, 508px) wrapped to two lines at 1440 and would have cost another 12px. On the first screen the note is one line from 1260px up and from 473 to 760px (stacked), two lines from 761 to 1259px and below 473px; in the Validation section it is one line from 473px up.

**3. Shortlist legend in the curve caption.** The caption read "Implied value of all 198 board rows; the shaded area is each row’s low–high band, the dots are the Start-here shortlist." It now reads **"Implied value of all 198 board rows with each row’s low–high band shaded. Red dots mark the 6 shortlist protocols."** The count is `shortlist.length` from the view, so it is printed as a figure. The in-plot caption "Implied value · USD · log scale" is unchanged, as are the SHORTLIST row tags and the accent colour. The brief described the caption as also covering a 50% band and point size by TVL; the caption never said either and the plot does not do the second (every dot is the same 7px), so neither claim was added. The new caption is shorter than the old one (556.3px against 571.1px at 12px italic) and is one line from 1260px up (was 1280px).

**4. Bytes: 59,974, guard unchanged at ≤ 60,000** (the guard at the time; raised to ≤ 61,000 in fix (22), which is what the test enforces now). 59,739 before; the three fixes added 353 (60,092); 118 bytes of dead code were removed, no minifying, no content or comment touched:

- CSS: `.short-item:nth-child(1),tbody tr[data-slug]:nth-child(1){--motion-delay:0ms}`. Every reader of the property is `var(--motion-delay,0ms)` and no ancestor of a card or row sets it, so first children already resolved to 0ms.
- `state.js`: `.slice()` directly after `.filter()` in the shortlist (the filter result is already a fresh array), and `|| 1` after `SORT_START[key]` (the five sortable columns the board renders are the five keys of `SORT_START`).
- `app.js`: `|| !isFinite(finalValue)` in the header count-up; the value is `Number()` of a string that just matched `/^\d+$/`, one of three row counts from `data.js`.

`v.category`, `v.chain` and `v.grade` in the view looked unread and were kept: `controls` reads them as `v[x[1]]`.

Proof, with `tools/radar-propdiff.mjs` comparing the build before the removal with the build after it, node by node (every computed property of every element and its `::before`/`::after`, bounding box, text): run at 1440, 1280, 1024, 761, 760, 431, 430 and 390px in the same five states as fix (15), 40 comparisons of 1,039 to 5,456 nodes. This time the count is not zero: 34 nodes per comparison (12 in the no-match search) differ, in one property only, `--motion-delay` itself, which reads `0ms` before and is unset after on the first card, the first board row and their descendants. No other property, box or text differs on any node; `animation-delay`, the only consumer, computes to 0ms both ways. The three JS removals change no output by construction and are covered by the same comparison and the 79 tests.

**5. Checks.** Tooltip check with detail and disclosures open at 1440, 1280, 1024, 760 and 390: 231 tips, 0 crossing the viewport edges, 0 clipped by the table wrap, `scrollWidth` equal to the viewport, no page or console errors; table scroll 0, 0, 55, 275, 645px as before. Width sweep 320–1600px (1px steps to 1100, 20px above, 806 widths): the document never exceeds the viewport, and the header, audit line, curve row, plot, plot labels, tiles, both notes and the shortlist cards stay inside the page at every width; the plot's rank labels are inside the row at every two-column width. The compact tile labels wrap to two lines at 278 widths between 320 and 987px, exactly as in the previous commit (same sweep run against `HEAD`). At 760px and below the row still stacks: curve, then the tiles and the note.

**6. Tests and screenshots.** 79 tests pass, none changed. Screenshots regenerated with `tools/shots7.mjs` after a rebuild and copied into `out/` by a second build: `1-board.png` shows board rows 1 and 2 in full and the note under the 2×2 tiles (the fixed "Model estimates, not prices." corner note covers the right end of row 2, the grade chip; it sat over the same corner of row 1 before); `4-calibration.png` shows the note under the four Validation tiles. `out/dossier.json` is `b9b90c1743445dfea135c6ceebe1541fdc452a3025c8d87d1615f1801167476b`.

## radar-21 follow-up fix (17): layout variant B, static estimate note, row-2 clearance

Dashboard only (`dashboard/app.css`, `app.js`). No file under `lib/`, `main.ts` or `test/` changed; `out/board.json` (`089b3997d61fd345bcae170253dd8b820addd27b9e0828a9ea3fd427d082524f`) and `out/data.js` (`eb2016342a232a7e30812f4f4347a3628eb80b9c54b94e3c9f063de6c0aefe92`) are byte-identical. No data, number or wording changed.

**1. Layout variant B is the layout.** Under the audit strip, one grid region (`.first-region`, built in `app.js`): the "Start here" shortlist on the left (58fr, 709.9px at 1440; cards 2 columns × 3 rows, 355px each, 318px inner), the evidence on the right (42fr, 514.1px; "Value by rank" over the four Validation tiles in a 2×2 grid), 32px gap. Region height 478.7px, as before and as in the prototype; the curve plot is 468.1×268.9px, identical to the prototype. At 1000px and below the region is one column, picks first, then evidence. The prototype's `?layout=b` switch, its variant-A defaults and its grid-area indirection were not ported. The "Start here" block's 12px bottom margin applies only in the one-column mode.

**2. Shortlist stat line.** Wording unchanged. One line from a 1200px viewport up; between 1001px and 1199px it wraps to two lines inside the card (`white-space:normal` on the shortlist's band text); it never leaves the card at any width 320–1600.

**3. "Model estimates, not prices." is no longer a fixed overlay.** It is a static, right-aligned element at the end of the "Ranked board" header row (`.est-note`, replacing `.fixed-note`), so it cannot cover board data. The header row keeps its 34.2px height. Width sweep 320–1600 in 10px steps: the note never intersects the heading, its caption, the controls, the grade strip or the table, and never leaves the viewport.

**4. Row-2 clearance at 1440×900.** Page top padding 12px → 6px and the board heading's top margin 14px → 8px. Row 1 784.88–833.38, row 2 833.38–883.38: 16.6px clear of the fold (4.6px in the same browser before the trim). No font size changed; the plot is not smaller.

**5. Byte budget.** 59,974 → 59,995 bytes (limit 60,000 at the time; raised to 61,000 in fix (22), which is what the test enforces now). The port, net of the layout rules it replaced (the three-column shortlist rules with their 1040px breakpoint, and the two-column `.curve` grid with its 760px override), added 471 bytes; 450 came back by shortening the two new code comments and removing code with no effect: a per-input `:focus-visible` rule that repeated the global one, `accent-color` on a checkbox with `appearance:none`, three `letter-spacing:0` declarations on elements that inherit no letter spacing, the `detail-in` keyframes (identical to `row-in`, which the detail now names), and a duplicated `.is-entering` animation rule merged into one selector list.

**6. Checks, tests, screenshots.** `tools/radar-check.mjs` at 1440, 1280, 1024, 760 and 390: 231 tips, 0 crossing, 0 clipped, `scrollWidth` equal to the viewport, no errors. No horizontal overflow at any width 320–1600. 79 tests pass, none changed. All four screenshots regenerated with `tools/shots7.mjs` and copied into `out/` by a second build.

## radar-21 follow-up fixes (18)–(26), short entries

Entries for (18)–(25) are summaries of their commits; the commit messages hold the detail. None of (18)–(24) or (26) changed `board.json` or `data.js`.

**(18) Review batch.** Card gridlines, red accent roles, the validation tile gloss, the chains cell (first chain plus "+N", the full list in the cell title), zero-count grades, the watchlist toggle and the two-line card stat. The board's whisker animations were simplified to one selector each.

**(19) Shortlist.** One common line above the cards; each card's stat line shows the category and TVL instead of the peer share.

**(20) Estimate marker.** A 1px paper halo and 4px width on the whisker bar's estimate marker. Escape now calls `closeDetail()` unconditionally (it returns early when nothing is open).

**(21) First-screen slack.** Controls and grade strip padding trimmed for font-metric differences; the card stat breaks into two lines below 1320px; the validation pair stacks at 1000px and below (was 760px).

**(22) Single-source constants.** Version, grade rules, resample count and winsor bounds come from `data.js`, not literals. **Dashboard byte guard raised from ≤ 60,000 to ≤ 61,000** (the user's decision; the judge's cap is 65,536). Statements of a 60,000-byte limit in earlier sections describe the guard as it was then.

**(23) Legibility.** New `--edge` colour (#857e6c) for card ticks, control borders and the grade C badge border; whisker track #e7e1d2 → #cfc8b6; zero grade counts opacity .4 → .65; halo dots under the curve's shortlist dots.

**(24) Review items 3–7.** Detail info markers scoped out of the `.facts` label rules; "×1.0 = perfect" moved next to the factor; one cost row; no "Ratio source" row; whisker tracks and grade badges aligned across rows.

**(25) Farm-plan steps (review item 8).** Risk check before deposit, one amount per plan, category templates for every board category, hours and executions counted from the steps. The only fix in this series that changed the hashes (farm fields only; no value, band, rank or grade moved).

**(26) Review items 9–21.** Dashboard and docs only; both hashes unchanged.
- Closing the detail scrolls the opener into view (centred, as the Close button's focus move does) when it is off-screen. Escape leaves focus where it already was, so focus alone did not scroll.
- The title tip opens downward (`h1+.info-tip::after{top:25px;bottom:auto}`); it was clipped above the page top.
- Start-here cards print the board rank (`r.rank`) instead of the card position.
- Method lead: "In-sample band coverage is 50.0% by construction (48.4% held out); the median absolute log error is 1.2378 (factor ×3.45)." Grade tooltips and the Grades paragraph say "median error factor ×N" instead of calling the factor a log error. "G2 percentile growth and M1 log-age" is spelled out.
- "already have a token" → "record a token" in the four dashboard strings.
- Search is trimmed and matches name, category or chain.
- Board table uses a fixed layout with column widths (`.c0`–`.c6`, narrower Category, Tokenized peers and Implied value columns below 1320px, `min-width:1016px`), so columns stay put across filter states and the empty state. `.estimate` min-widths removed (no effect under fixed layout).
- TVL bars are on a log scale from the board's smallest TVL to its largest.
- Zero-count grade opacity .65 → .85; WATCHLIST tag colour #b5391b (was the accent).
- `.disclosure` overflow hidden → `overflow-x:auto`; the validation pair's two columns also scroll horizontally (`.pair>*{overflow-x:auto}`), which removes the ablation table's page overflow under the wide-font simulation.
- `screenshots-zoom/` added to `.gitignore`.
