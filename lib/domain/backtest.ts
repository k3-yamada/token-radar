import { calibrate, type CalibrationOptions } from './calibration.ts';
import { ageDays, BASELINE_SHAPES, blendedCalibrationCentre, changePercentiles, estimate, growthFactor, maturityFactor, type CentreEstimator, type FactorShapes } from './estimate.ts';
import { selectScoredRows } from './eligibility.ts';
import { median, quantile } from './statistics.ts';
import { MODEL, type CalibrationSet, type Snapshot, type SnapshotProtocol } from './types.ts';

export interface BacktestObservation {
  slug: string;
  basis: 'category' | 'global-anchored' | 'global';
  covered: boolean;
  /** ln(predicted / realized): positive when the model over-predicts. */
  logError: number;
  /** Log distance from the band centre down to the band's lower edge (centre - low), at width 1. */
  lowLogDistance: number;
  /** Log distance from the band centre up to the band's upper edge (high - centre), at width 1. */
  highLogDistance: number;
  bandRatio: number;
  peerCount: number;
  blendWeight: number;
  predictedValue: number;
  realizedValue: number;
}

export interface BandMultipliers {
  category: number;
  global_anchored: number;
}
export interface ResidualQuantiles { category: { r25: number; r75: number }; global_anchored: { r25: number; r75: number } }

export interface SizeAdjustment {
  slope: number;
  quad?: number;
  mode: 'global' | 'category';
}

export interface ContestMetrics {
  overall: ReturnType<typeof summarizeBacktest>['all'];
  first_half: ReturnType<typeof summarizeBacktest>['all'];
  second_half: ReturnType<typeof summarizeBacktest>['all'];
}

/**
 * Whether the realized value lies inside the band [centre - width * low, centre + width * high] (log space) that
 * `estimate` emits. logError is ln(predicted / realized), so the realized value is above the centre when logError is
 * negative: it is inside iff -width * high <= logError <= width * low. The upper distance bounds the negative side.
 */
export function withinBand(logError: number, lowLogDistance: number, highLogDistance: number, width = 1): boolean {
  return logError >= -width * highLogDistance && logError <= width * lowLogDistance;
}

function contestMetrics(rows: BacktestObservation[]): ContestMetrics {
  const ordered = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
  const summarize = (part: BacktestObservation[]) => {
    return summarizeBacktest(part).all;
  };
  return {
    overall: summarize(ordered),
    first_half: summarize(ordered.filter((_, index) => index % 2 === 0)),
    second_half: summarize(ordered.filter((_, index) => index % 2 === 1))
  };
}

function calibratedContest(snapshot: Snapshot, adjustment: SizeAdjustment, options: Parameters<typeof backtest>[1] = {}) {
  const run = (extra: Parameters<typeof backtest>[1] = {}) => {
    return backtest(snapshot, { sizeAdjustment: adjustment, ...options, ...extra });
  };
  const correction = Math.exp(-median(run().map(row => row.logError)));
  const corrected = run({ biasFactor: correction });
  const widths = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category')),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category'))
  };
  return run({ biasFactor: correction, bandMultipliers: widths });
}

function ensembleContest(snapshot: Snapshot, adjustment: SizeAdjustment) {
  const base = calibratedContest(snapshot, adjustment);
  const half = calibratedContest(snapshot, adjustment, { factorWeight: .5 });
  const higherK = calibratedContest(snapshot, adjustment, { shrinkage: { base: 12, min: 4, max: 48 } });
  const groups = [base, half, higherK];
  const joined = base.map((row, index) => {
    const peers = groups.map(group => group[index]!);
    const predictedValue = Math.exp(peers.reduce((sum, item) => sum + Math.log(item.predictedValue), 0) / peers.length);
    const low = Math.exp(peers.reduce((sum, item) => sum + Math.log(item.predictedValue) - item.lowLogDistance, 0) / peers.length);
    const high = Math.exp(peers.reduce((sum, item) => sum + Math.log(item.predictedValue) + item.highLogDistance, 0) / peers.length);
    const realizedValue = row.realizedValue;
    const logError = Math.log(predictedValue / realizedValue);
    return { ...row, predictedValue, realizedValue, logError, lowLogDistance: Math.log(predictedValue / low), highLogDistance: Math.log(high / predictedValue), covered: withinBand(logError, Math.log(predictedValue / low), Math.log(high / predictedValue)), impliedLow: low, impliedHigh: high };
  });
  const bias = Math.exp(-median(joined.map(row => row.logError)));
  const corrected = joined.map(row => ({ ...row, predictedValue: row.predictedValue * bias, logError: row.logError + Math.log(bias) }));
  const widths = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category')),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category'))
  };
  const final = corrected.map(row => {
    const width = widths[row.basis === 'category' ? 'category' : 'global_anchored'];
    return { ...row, covered: withinBand(row.logError, row.lowLogDistance, row.highLogDistance, width), bandRatio: Math.exp(width * (row.lowLogDistance + row.highLogDistance)) };
  });
  return contestMetrics(final);
}

function quadraticSizeAdjustment(snapshot: Snapshot): SizeAdjustment & { center: number } {
  const rows = snapshot.protocols.filter(isLive).filter(p => !DERIVATIVE.has(p.category ?? ''));
  const center = adjustmentCenter(rows);
  const xs = rows.map(p => Math.log(p.tvl_usd) - center);
  const ys = rows.map(p => Math.log(p.mcap_usd! / p.tvl_usd));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanX2 = xs.reduce((sum, x) => sum + x * x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const a = xs.map(x => x - meanX);
  const b = xs.map(x => x * x - meanX2);
  const y = ys.map(value => value - meanY);
  const aa = a.reduce((sum, value) => sum + value * value, 0);
  const ab = a.reduce((sum, value, i) => sum + value * b[i]!, 0);
  const bb = b.reduce((sum, value) => sum + value * value, 0);
  const ay = a.reduce((sum, value, i) => sum + value * y[i]!, 0);
  const by = b.reduce((sum, value, i) => sum + value * y[i]!, 0);
  const determinant = aa * bb - ab * ab;
  const slope = determinant ? (ay * bb - by * ab) / determinant : 0;
  const quad = determinant ? (by * aa - ay * ab) / determinant : 0;
  return { mode: 'global', slope, quad, center };
}

export function estimatorContestReport(snapshot: Snapshot) {
  const base = globalSizeAdjustment(snapshot);
  const centre = (estimator: CentreEstimator) => {
    const rows = calibratedContest(snapshot, { ...base, mode: 'global' }, { centreEstimator: estimator });
    return contestMetrics(rows);
  };
  const v0 = { ...MODEL };
  const runVariant = (model: typeof MODEL, shrinkage = { base: 6, min: 2, max: 24 }) => {
    const rows = calibratedContest(snapshot, { ...base, mode: 'global' }, { model, shrinkage });
    return contestMetrics(rows);
  };
  const v1Rows = calibratedContest(snapshot, { ...base, mode: 'global' }, { factorWeight: .5 });
  const v1 = contestMetrics(v1Rows);
  const quadraticRows = calibratedContest(snapshot, quadraticSizeAdjustment(snapshot));
  const quadratic = contestMetrics(quadraticRows);
  return {
    centre: { median: centre('median'), trimmed_mean: centre('trimmed-mean'), huber_mean: centre('huber-mean') },
    model_averaging: { V0: runVariant(v0), V1: v1, V2: runVariant(v0, { base: 12, min: 4, max: 48 }), ensemble: ensembleContest(snapshot, { ...base, mode: 'global' }) },
    quadratic_size: quadratic
  };
}

const DERIVATIVE = new Set(MODEL.global_excluded_categories);
const isLive = (p: SnapshotProtocol) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;

/**
 * Medians of the powered growth and maturity factors over the rows the board would score from `snapshot`,
 * i.e. what production divides out. `medianChange` must be that same snapshot's median 7d change (the value
 * `calibrate(snapshot).medianChange` hands to `estimate`), so G1/G3 see the centre they are scored with; G2 ignores it.
 */
export function factorNormalizers(snapshot: Snapshot, shapes: FactorShapes, model: typeof MODEL, medianChange: number, unknownAge = model.unknown_listed_age_days, amplitudes = { growth: 1, maturity: 1 }): { growth: number; maturity: number } {
  const percentiles = changePercentiles(snapshot.protocols);
  const scored = selectScoredRows(snapshot, model);
  return {
    growth: median(scored.map(p => Math.exp(amplitudes.growth * Math.log(growthFactor(shapes.growth, p.change_7d, medianChange, model, percentiles.get(p.slug) ?? .5))))) || 1,
    maturity: median(scored.map(p => Math.exp(amplitudes.maturity * Math.log(maturityFactor(shapes.maturity, ageDays(snapshot.as_of, p.listed_at), model, unknownAge))))) || 1
  };
}

export function derivedUnknownAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols.map(p => ageDays(snapshot.as_of, p.listed_at)).filter((x): x is number => x !== null);
  return median(ages) || 0;
}

export function fitFactorAmplitudes(snapshot: Snapshot, adjustment?: SizeAdjustment, unknownAge = derivedUnknownAge(snapshot)) {
  const live = snapshot.protocols.filter(isLive);
  // The size-adjustment centre is always the median log TVL of the peers being fitted, so a caller passing only { mode, slope } cannot produce NaN residuals.
  const center = adjustmentCenter(live.filter(p => !DERIVATIVE.has(p.category ?? '')));
  const cal = calibrate(snapshot, adjustment ? { ...adjustment, center } : undefined);
  const percentiles = changePercentiles(snapshot.protocols);
  const residuals: number[] = [], gx: number[] = [], mx: number[] = [];
  for (const p of live) {
    const set = p.category ? cal.categories.get(p.category) : undefined;
    // The centre estimate() predicts from: the dispersion-aware shrinkage blend of category and global centres
    // (global alone without live category peers), not the unshrunk category median.
    const centre = blendedCalibrationCentre(set ?? { count: 0, q25: 0, median: 0, q75: 0 }, cal.global, p.category ? cal.samples.get(p.category) : undefined, cal.samples.get('global'));
    const raw = Math.log(p.mcap_usd! / p.tvl_usd);
    const size = adjustment ? adjustment.slope * (Math.log(p.tvl_usd) - center) : 0;
    residuals.push(raw - size - centre);
    gx.push(Math.log(growthFactor('G2', p.change_7d, 0, MODEL, percentiles.get(p.slug) ?? .5)));
    mx.push(Math.log(maturityFactor('M1', ageDays(snapshot.as_of, p.listed_at), MODEL, unknownAge)));
  }
  const gc = median(gx), mc = median(mx), x = gx.map(v => v-gc), y = mx.map(v => v-mc);
  const fit = (z: number[]) => { const den=z.reduce((s,v)=>s+v*v,0); return den ? z.reduce((s,v,i)=>s+v*residuals[i]!,0)/den : 1; };
  return { growth: fit(x), maturity: fit(y), unknownAge };
}

/**
 * The amplitudes an evaluation arm applies to `sample`: the one procedure shared by every LOO fold in `backtest`
 * (sample = the snapshot minus the held-out peer) and by `factorChangeReport().amplitudes` (sample = the full snapshot).
 */
export function evaluatedAmplitudes(sample: Snapshot, sizeAdjustment: SizeAdjustment | undefined, arm: { fitAmplitudes?: boolean; derivedUnknownAge?: boolean }) {
  const unknownAge = arm.derivedUnknownAge ? derivedUnknownAge(sample) : MODEL.unknown_listed_age_days;
  return arm.fitAmplitudes ? fitFactorAmplitudes(sample, sizeAdjustment, unknownAge) : { growth: 1, maturity: 1, unknownAge };
}

function adjustmentCenter(rows: SnapshotProtocol[]): number {
  return median(rows.map(p => Math.log(p.tvl_usd)));
}

function adjustmentParameters(protocol: SnapshotProtocol, rows: SnapshotProtocol[], adjustment?: SizeAdjustment) {
  if (!adjustment) return undefined;
  let eligible = rows.filter(isLive).filter(p => !DERIVATIVE.has(p.category ?? ''));
  if (adjustment.mode === 'category' && protocol.category) {
    const categoryRows = rows.filter(isLive).filter(p => p.category === protocol.category);
    if (categoryRows.length >= 4) eligible = categoryRows;
  }
  return { slope: adjustment.slope, quad: adjustment.quad, center: adjustmentCenter(eligible) };
}

export type BacktestOptions = {
  biasFactor?: number;
  bandMultipliers?: BandMultipliers;
  bandMultiplier?: number;
  dispersionShrinkage?: boolean;
  factorShapes?: FactorShapes;
  sizeAdjustment?: SizeAdjustment;
  peerWeighting?: 'uniform' | 'kernel';
  singlePeerBlend?: boolean;
  centreEstimator?: CentreEstimator;
  model?: typeof MODEL;
  shrinkage?: { base: number; min: number; max: number };
  factorWeight?: number;
  fitAmplitudes?: boolean;
  derivedUnknownAge?: boolean;
  calibrationOptions?: CalibrationOptions;
  /** Refit the size-adjustment slope on each fold's training rows instead of taking the caller's slope (validation only; production passes its full-sample slope). */
  refitSlope?: boolean;
};

/**
 * One held-out prediction: the model is calibrated on `reduced` (which must not contain `peer`) and predicts `peer`'s
 * market cap. Shared by every leave-one-out fold in `backtest` and by the walk-forward test, so both score the same
 * procedure. `percentiles` are the 7d-change percentiles of the full snapshot (no market-cap information).
 */
export function observePeer(peer: SnapshotProtocol, reduced: Snapshot, percentiles: Map<string, number>, options: BacktestOptions = {}): BacktestObservation {
  const shapes = options.factorShapes ?? BASELINE_SHAPES;
  const model = options.model ?? MODEL;
  const sizeAdjustment = options.refitSlope && options.sizeAdjustment ? { ...options.sizeAdjustment, slope: globalSizeAdjustment(reduced).slope } : options.sizeAdjustment;
  const amplitudes = evaluatedAmplitudes(reduced, sizeAdjustment, options);
  const unknownAge = amplitudes.unknownAge;
  const params = adjustmentParameters(peer, reduced.protocols, sizeAdjustment);
  const calibration = calibrate(reduced, params, options.centreEstimator, options.calibrationOptions);
  const categorySet = peer.category ? calibration.categories.get(peer.category) : undefined;
  let selected: CalibrationSet = categorySet ?? { count: 0, q25: 0, median: 0, q75: 0 };
  if (options.peerWeighting === 'kernel' && peer.category && categorySet) {
    const peers = reduced.protocols.filter(p => isLive(p) && p.category === peer.category);
    const globalPeers = reduced.protocols.filter(p => isLive(p) && !DERIVATIVE.has(p.category ?? ''));
    const iqr = (values: number[]) => quantile(values, .75) - quantile(values, .25);
    const scale = (values: number[], fallback: number[]) => iqr(values) || iqr(fallback) || 1;
    const hT = scale(peers.map(p => Math.log(p.tvl_usd)), globalPeers.map(p => Math.log(p.tvl_usd)));
    const ageYears = (p: SnapshotProtocol) => (ageDays(reduced.as_of, p.listed_at) ?? 365) / 365;
    const hA = scale(peers.map(ageYears), globalPeers.map(ageYears));
    const globalSamples = calibration.samples.get('global') ?? [];
    const lower = quantile(globalSamples, .01);
    const upper = quantile(globalSamples, .99);
    const weighted = peers.map(p => {
      const raw = Math.log(p.mcap_usd! / p.tvl_usd) + (params ? -params.slope * (Math.log(p.tvl_usd) - params.center) : 0);
      const x = Math.max(lower, Math.min(upper, raw));
      const dt = Math.log(p.tvl_usd) - Math.log(peer.tvl_usd);
      const da = ageYears(p) - ageYears(peer);
      return { value: x, weight: Math.exp(-(dt * dt) / (2 * hT * hT)) * Math.exp(-(da * da) / (2 * hA * hA)) };
    }).sort((a, b) => a.value - b.value);
    const wq = (level: number) => {
      const total = weighted.reduce((sum, row) => sum + row.weight, 0);
      let cumulative = 0;
      for (const row of weighted) {
        cumulative += row.weight / total;
        if (cumulative >= level) return row.value;
      }
      return weighted.at(-1)?.value ?? 0;
    };
    selected = { count: categorySet.count, q25: wq(.25), median: wq(.5), q75: wq(.75) };
  }
  const prediction = estimate(peer, reduced.as_of, selected, calibration.global, model, calibration.medianChange, {
    factorShapes: shapes,
    changePercentile: percentiles.get(peer.slug) ?? .5,
    categorySamples: options.dispersionShrinkage === false ? undefined : (peer.category ? calibration.samples.get(peer.category) : undefined),
    globalSamples: options.dispersionShrinkage === false ? undefined : calibration.samples.get('global'),
    biasFactor: options.biasFactor,
    sizeAdjustment: params,
    singlePeerBlend: options.singlePeerBlend
    , centreEstimator: options.centreEstimator,
    shrinkage: options.shrinkage
    , amplitudes, unknownAge
  });
  const factors = factorNormalizers(reduced, shapes, model, calibration.medianChange, unknownAge, amplitudes);
  // Production divides the scored rows' factor medians out of every row: the unweighted normalization term.
  // factorWeight (research arms only) then scales the row's own factor log-deviations from those medians, so the
  // weighted log value carries w*(ln g - ln gMedian) + w*(ln m - ln mMedian) in place of the unweighted deviations.
  // The correction varies by row, so a median bias correction cannot cancel it; at the default weight 1 nothing is
  // added and the observations are bit-identical.
  const factorWeight = options.factorWeight ?? 1;
  const factorDeviation = (Math.log(prediction.growthMult) - Math.log(factors.growth)) + (Math.log(prediction.maturityMult) - Math.log(factors.maturity));
  const unweighted = -Math.log(factors.growth) - Math.log(factors.maturity);
  const normalization = factorWeight === 1 ? unweighted : unweighted + (factorWeight - 1) * factorDeviation;
  const logError = Math.log(prediction.implied / peer.mcap_usd!) + normalization;
  const width = options.bandMultipliers?.[prediction.basis === 'category' ? 'category' : 'global_anchored'] ?? options.bandMultiplier ?? 1;
  const lowLogDistance = prediction.centre - prediction.q25;
  const highLogDistance = prediction.q75 - prediction.centre;
  const covered = withinBand(logError, lowLogDistance, highLogDistance, width);
  const bandRatio = prediction.high / Math.max(1, prediction.low);
  return { slug: peer.slug, basis: prediction.basis, covered, logError, lowLogDistance, highLogDistance, bandRatio, peerCount: prediction.ratioCount, blendWeight: prediction.blendWeight, predictedValue: prediction.implied * Math.exp(normalization), realizedValue: peer.mcap_usd! };
}

export function backtest(snapshot: Snapshot, options: BacktestOptions = {}): BacktestObservation[] {
  const percentiles = changePercentiles(snapshot.protocols);
  return snapshot.protocols.filter(isLive).map(peer => observePeer(peer, { ...snapshot, protocols: snapshot.protocols.filter(p => p.slug !== peer.slug) }, percentiles, options));
}


export function summarizeBacktest(rows: BacktestObservation[]) {
  const summarize = (subset: BacktestObservation[]) => ({
    count: subset.length,
    coverage: subset.length ? subset.filter(row => row.covered).length / subset.length : 0,
    band_coverage: subset.length ? subset.filter(row => row.covered).length / subset.length : 0,
    median_log_error: median(subset.map(row => row.logError)),
    median_absolute_log_error: median(subset.map(row => Math.abs(row.logError)))
  });
  return {
    all: summarize(rows),
    by_basis: {
      category: summarize(rows.filter(row => row.basis === 'category')),
      global_anchored: summarize(rows.filter(row => row.basis !== 'category'))
    }
  };
}

function averageRanks(values: number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let i = 0; i < order.length;) {
    let end = i + 1;
    while (end < order.length && order[end]!.value === order[i]!.value) end++;
    const rank = ((i + 1) + end) / 2;
    for (let j = i; j < end; j++) ranks[order[j]!.index] = rank;
    i = end;
  }
  return ranks;
}

function correlation(a: number[], b: number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  const numerator = a.reduce((s, x, i) => s + (x - ma) * (b[i]! - mb), 0);
  const da = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0));
  const db = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0));
  return da && db ? numerator / (da * db) : 0;
}

export function selectionDiagnostics(rows: BacktestObservation[]) {
  const predicted = [...rows].sort((a, b) => b.predictedValue - a.predictedValue || a.slug.localeCompare(b.slug));
  const realized = [...rows].sort((a, b) => b.realizedValue - a.realizedValue || a.slug.localeCompare(b.slug));
  const predictedTop10 = predicted.slice(0, 10);
  const realizedTop10 = new Set(realized.slice(0, 10).map(row => row.slug));
  const sample = (subset: BacktestObservation[]) => ({ count: subset.length, median_log_error: median(subset.map(row => row.logError)), median_absolute_log_error: median(subset.map(row => Math.abs(row.logError))) });
  const topN = (n: number) => {
    const top = predicted.slice(0, n);
    const slugs = new Set(top.map(row => row.slug));
    return { top: sample(top), rest: sample(predicted.filter(row => !slugs.has(row.slug))) };
  };
  return {
    rank_quality: { spearman: correlation(averageRanks(rows.map(row => row.predictedValue)), averageRanks(rows.map(row => row.realizedValue))), top10_overlap: predictedTop10.filter(row => realizedTop10.has(row.slug)).length },
    winner_curse: { top10: topN(10), top20: topN(20) }
  };
}

/** The coverage the shipped band's width multiplier is tuned to: the nominal level of the low-high band. */
export const BAND_TARGET_COVERAGE = .5;

export function bestBandMultiplier(rows: BacktestObservation[]): number {
  let best = .5;
  let closest = Infinity;
  for (let step = 50; step <= 300; step++) {
    const candidate = step / 100;
    const coverage = rows.length ? rows.filter(row => withinBand(row.logError, row.lowLogDistance, row.highLogDistance, candidate)).length / rows.length : 0;
    const distance = Math.abs(coverage - BAND_TARGET_COVERAGE);
    if (distance < closest) {
      closest = distance;
      best = candidate;
    }
  }
  return best;
}

export function calibrateBacktest(snapshot: Snapshot, factorShapes: FactorShapes = BASELINE_SHAPES, sizeAdjustment?: SizeAdjustment, variants: { peerWeighting?: 'uniform' | 'kernel'; singlePeerBlend?: boolean; centreEstimator?: CentreEstimator; model?: typeof MODEL; shrinkage?: { base: number; min: number; max: number }; factorWeight?: number; fitAmplitudes?: boolean; derivedUnknownAge?: boolean; dispersionShrinkage?: boolean; calibrationOptions?: CalibrationOptions; bandContinuity?: 'current' | 'threshold' | 'interpolate' } = {}) {
  const arm = (extra: { biasFactor?: number; bandMultipliers?: BandMultipliers } = {}) => backtest(snapshot, { factorShapes, sizeAdjustment, ...variants, ...extra });
  const uncorrected = arm();
  const correctionFactor = Math.exp(-median(uncorrected.map(row => row.logError)));
  const corrected = arm({ biasFactor: correctionFactor });
  const residualQuantiles: ResidualQuantiles = {
    category: (() => { const xs = corrected.filter(row => row.basis === 'category').map(row => -row.logError); return { r25: quantile(xs, .25), r75: quantile(xs, .75) }; })(),
    global_anchored: (() => { const xs = corrected.filter(row => row.basis !== 'category').map(row => -row.logError); return { r25: quantile(xs, .25), r75: quantile(xs, .75) }; })()
  };
  // The residual band is [centre + m * r25, centre + m * r75] with r the quantiles of ln(realized / predicted), so its
  // lower distance is -r25 and its upper distance is r75.
  const widthMultipliers: BandMultipliers = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category').map(row => ({ ...row, lowLogDistance: -residualQuantiles.category.r25, highLogDistance: residualQuantiles.category.r75 }))),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category').map(row => ({ ...row, lowLogDistance: -residualQuantiles.global_anchored.r25, highLogDistance: residualQuantiles.global_anchored.r75 })))
  };
  const final = corrected.map(row => {
    let categoryBasis = row.basis === 'category';
    if (variants.bandContinuity === 'threshold' && row.blendWeight < .5) categoryBasis = false;
    const blend = variants.bandContinuity === 'interpolate' ? row.blendWeight : Number(categoryBasis);
    const r25 = residualQuantiles.global_anchored.r25 * (1 - blend) + residualQuantiles.category.r25 * blend;
    const r75 = residualQuantiles.global_anchored.r75 * (1 - blend) + residualQuantiles.category.r75 * blend;
    const m = categoryBasis ? widthMultipliers.category : widthMultipliers.global_anchored;
    const lowLogDistance = -r25; const highLogDistance = r75;
    const covered = withinBand(row.logError, lowLogDistance, highLogDistance, m);
    return { ...row, lowLogDistance, highLogDistance, covered, bandRatio: Math.exp(m * (r75 - r25)) };
  });
  return { correctionFactor, widthMultipliers, residualQuantiles, observations: final, summary: summarizeBacktest(final) };
}

/**
 * Adoption gate for fitted factor amplitudes, on contest metrics of the two arms' LOO observations: the fitted arm must
 * cut the overall median absolute log error by at least 3% and must not worsen either slug-ordered half by more than 1%.
 */
export function adoptFittedAmplitudes(fitted: ContestMetrics, base: ContestMetrics): boolean {
  return fitted.overall.median_absolute_log_error <= .97 * base.overall.median_absolute_log_error
    && fitted.first_half.median_absolute_log_error <= 1.01 * base.first_half.median_absolute_log_error
    && fitted.second_half.median_absolute_log_error <= 1.01 * base.second_half.median_absolute_log_error;
}

export function factorChangeReport(snapshot: Snapshot, sizeAdjustment?: SizeAdjustment) {
  const arm = (fitAmplitudes: boolean, derivedUnknownAge: boolean) => calibrateBacktest(snapshot, BASELINE_SHAPES, sizeAdjustment, { fitAmplitudes, derivedUnknownAge });
  const metrics = (rows: BacktestObservation[]) => contestMetrics(rows);
  const base = arm(false, false);
  const fitted = arm(true, false);
  // The halves live on contest metrics, not on calibrateBacktest's summary ({ all, by_basis } only).
  const baseM = metrics(base.observations), fittedM = metrics(fitted.observations);
  const chooseFit = adoptFittedAmplitudes(fittedM, baseM);
  const afterFit = chooseFit ? fitted : base;
  const unknown = arm(chooseFit, true);
  const chooseUnknown = unknown.summary.all.median_absolute_log_error <= afterFit.summary.all.median_absolute_log_error * 1.01;
  // The decision above is scored on amplitudes refit inside every LOO fold, so no single evaluated pair exists.
  // `amplitudes` is therefore the full-sample fit through that same procedure (`evaluatedAmplitudes`), under the
  // unknown-age setting of the fitted arm the adoption rests on: the `fitted` arm (fixed unknown age) unless the
  // fit was adopted and the derived unknown age was then adopted on top of it (the `unknown` arm). It was
  // previously always fitted at the full-sample derived unknown age, a setting no evaluated arm necessarily used.
  const amplitudes = evaluatedAmplitudes(snapshot, sizeAdjustment, { fitAmplitudes: true, derivedUnknownAge: chooseFit && chooseUnknown });
  return { baseline: baseM, fitted: fittedM, unknown_age: metrics(unknown.observations), adopted_amplitudes: chooseFit, adopted_unknown_age: chooseUnknown, selected: chooseUnknown ? unknown : afterFit, amplitudes, unknownAge: derivedUnknownAge(snapshot) };
}

export const GRADE_BAND_EDGES = [3, 10, 30, 100] as const;

export function summarizeGradeBands(rows: BacktestObservation[]) {
  const bounds = [3, 10, 30, 100];
  return [null, ...bounds, Infinity].slice(1).map((upper, index) => {
    const lower = index === 0 ? 0 : bounds[index - 1]!;
    const subset = rows.filter(row => row.bandRatio > lower && row.bandRatio <= upper);
    const summary = summarizeBacktest(subset).all;
    return { label: index === 0 ? 'at_most_3' : index === 4 ? 'over_100' : `${lower}_to_${upper}`, lower_exclusive: lower, upper_inclusive: Number.isFinite(upper) ? upper : null, count: summary.count, coverage: summary.coverage, median_absolute_log_error: summary.count ? summary.median_absolute_log_error : null };
  });
}

/**
 * The grade thresholds, defined once: a grade needs at least `min_peers` calibration peers and a band ratio of at most
 * `max_band_ratio`; a row meeting neither A nor B is C. Emitted as `grade_rules`, which the dashboard builds its rule text from.
 */
export const GRADE_RULES = { A: { min_peers: 10, max_band_ratio: 10 }, B: { min_peers: 5, max_band_ratio: 30 } } as const;

export function gradeForBandRatio(bandRatio: number, peerCount: number): 'A' | 'B' | 'C' {
  const meets = (rule: { min_peers: number; max_band_ratio: number }) => peerCount >= rule.min_peers && bandRatio <= rule.max_band_ratio;
  return meets(GRADE_RULES.A) ? 'A' : meets(GRADE_RULES.B) ? 'B' : 'C';
}

function leastSquaresSlope(rows: SnapshotProtocol[]): number {
  const xs = rows.map(row => Math.log(row.tvl_usd));
  const ys = rows.map(row => Math.log(row.mcap_usd!));
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  return denominator ? xs.reduce((sum, value, i) => sum + (value - meanX) * (ys[i]! - meanY), 0) / denominator : 1;
}

export function sizeAdjustmentSlope(snapshot: Snapshot): number {
  return leastSquaresSlope(snapshot.protocols.filter(isLive).filter(p => !DERIVATIVE.has(p.category ?? ''))) - 1;
}

export function globalSizeAdjustment(snapshot: Snapshot, includeExcluded = false): { slope: number; center: number } {
  const rows = snapshot.protocols.filter(isLive).filter(p => includeExcluded || !DERIVATIVE.has(p.category ?? ''));
  return { slope: leastSquaresSlope(rows) - 1, center: adjustmentCenter(rows) };
}

function withinCategorySlope(snapshot: Snapshot): number {
  const groups = new Map<string, SnapshotProtocol[]>();
  for (const protocol of snapshot.protocols.filter(isLive)) {
    if (!protocol.category) continue;
    groups.set(protocol.category, [...(groups.get(protocol.category) ?? []), protocol]);
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const meanX = rows.reduce((sum, row) => sum + Math.log(row.tvl_usd), 0) / rows.length;
    const meanY = rows.reduce((sum, row) => sum + Math.log(row.mcap_usd!), 0) / rows.length;
    for (const row of rows) {
      xs.push(Math.log(row.tvl_usd) - meanX);
      ys.push(Math.log(row.mcap_usd!) - meanY);
    }
  }
  const mx = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const my = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - mx) ** 2, 0);
  return denominator ? xs.reduce((sum, value, i) => sum + (value - mx) * (ys[i]! - my), 0) / denominator - 1 : 0;
}

/**
 * `variants` carries the factor settings the caller evaluates under (`runBacktest` passes the build's decisions), so the
 * W/P contest arms differ from the reported model only in the one setting each contests. The default is the model
 * default: fixed amplitudes and the fixed unknown age.
 */
export function measurementReport(snapshot: Snapshot, variants: { fitAmplitudes?: boolean; derivedUnknownAge?: boolean } = {}) {
  // withinCategorySlope already returns the log-ratio slope (log-mcap slope minus 1); do not subtract again.
  const categorySlope = withinCategorySlope(snapshot);
  const globalAdjustment = globalSizeAdjustment(snapshot);
  const baseline = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope }, variants);
  const weighted = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope }, { ...variants, peerWeighting: 'kernel' });
  const blended = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope }, { ...variants, singlePeerBlend: true });
  const proxyCategories = new Map<string, number>();
  for (const row of snapshot.protocols.filter(isLive)) proxyCategories.set(row.category ?? 'Other', (proxyCategories.get(row.category ?? 'Other') ?? 0) + 1);
  const proxySlugs = new Set(snapshot.protocols.filter(isLive).filter(row => proxyCategories.get(row.category ?? 'Other') === 2).map(row => row.slug));
  // Proxy rows are read from the calibrated arms' own observations, whose coverage is scored against the residual band
  // production emits. They were previously re-run through backtest() with the residual-fit width multipliers applied to
  // the peer-quartile band, a band no build emits.
  const p0Rows = baseline.observations.filter(row => proxySlugs.has(row.slug));
  const p1Rows = blended.observations.filter(row => proxySlugs.has(row.slug));
  return {
    global_ratio_slope: sizeAdjustmentSlope(snapshot),
    within_category_ratio_slope: categorySlope,
    contest: {
      W0: baseline.summary,
      W1: weighted.summary,
      P0: baseline.summary,
      P1: blended.summary,
      P1_proxy: { P0: summarizeBacktest(p0Rows).all, P1: summarizeBacktest(p1Rows).all }
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Validation of the shipped model (radar-21). Every figure below is computed from the snapshot at build time.
// ---------------------------------------------------------------------------------------------------------------------

/** The quantile levels of the wider, not shipped, residual band reported beside the shipped one. */
export const WIDE_BAND_QUANTILES = { low: .1, high: .9 } as const;
const SHIPPED_BAND_QUANTILES = { low: .25, high: .75 } as const;

const round2 = (value: number) => Math.round(value * 100) / 100;
/** A median absolute log error with the multiplicative error factor e^value it stands for, to 2 decimals. */
export function errorMetric(absoluteLogErrors: number[]) {
  const value = median(absoluteLogErrors);
  return { median_absolute_log_error: value, error_factor: round2(Math.exp(value)) };
}

/**
 * Splits dated rows at their median listing date. The split date is the lower median of the sorted dates; rows listed
 * on or before it train, rows listed after it test, so rows sharing the split date all train. Undated rows are in neither.
 */
export function walkForwardSplit<T extends { slug: string; listed_at: string | null }>(rows: T[]): { split_date: string | null; train: T[]; test: T[]; undated: T[] } {
  const dated = rows.filter(row => row.listed_at !== null).sort((a, b) => a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
  const undated = rows.filter(row => row.listed_at === null);
  if (!dated.length) return { split_date: null, train: [], test: [], undated };
  const splitDate = dated[Math.floor((dated.length - 1) / 2)]!.listed_at!;
  return { split_date: splitDate, train: dated.filter(row => row.listed_at! <= splitDate), test: dated.filter(row => row.listed_at! > splitDate), undated };
}

type FactorVariants = { fitAmplitudes?: boolean; derivedUnknownAge?: boolean };

/** The walk-forward split of the tokenized peers and the training snapshot: every protocol except the later-half and undated peers. */
function walkForwardTrain(snapshot: Snapshot) {
  const split = walkForwardSplit(snapshot.protocols.filter(isLive));
  const trainSlugs = new Set(split.train.map(p => p.slug));
  const train: Snapshot = { ...snapshot, protocols: snapshot.protocols.filter(p => !isLive(p) || trainSlugs.has(p.slug)) };
  return { split, train };
}

/** Each error minus the median error of the other peers: the strict protocol's bias correction, which never sees the held-out peer. */
function recentreByOthers(errors: number[]): number[] {
  return errors.map((error, index) => error - median(errors.filter((_, other) => other !== index)));
}

/**
 * Walk-forward test of the shipped procedure. The training snapshot keeps every protocol except the tokenized peers
 * outside the earlier half (the later half and the undated peers), so no test market cap reaches the size slope, the
 * category and global calibration, the bias correction, the residual quantiles or the band multipliers: all are
 * refit on the earlier half alone. Each later-half peer is then predicted once and scored against that band.
 */
export function walkForward(snapshot: Snapshot, variants: FactorVariants = {}) {
  const { split, train } = walkForwardTrain(snapshot);
  const base = { split_date: split.split_date, dated_peers: split.train.length + split.test.length, undated_peers_excluded: split.undated.length, train_count: split.train.length, test_count: split.test.length };
  if (!split.train.length || !split.test.length) return { ...base, median_absolute_log_error: null, error_factor: null, median_log_error: null, band_coverage: null, band_nominal_coverage: BAND_TARGET_COVERAGE };
  const sizeAdjustment: SizeAdjustment = { mode: 'global', slope: globalSizeAdjustment(train).slope };
  const fitted = calibrateBacktest(train, BASELINE_SHAPES, sizeAdjustment, variants);
  const percentiles = changePercentiles(snapshot.protocols);
  const observations = split.test.map(peer => observePeer(peer, train, percentiles, { sizeAdjustment, ...variants, biasFactor: fitted.correctionFactor }));
  const covered = observations.filter(row => {
    const key = row.basis === 'category' ? 'category' : 'global_anchored';
    return withinBand(row.logError, -fitted.residualQuantiles[key].r25, fitted.residualQuantiles[key].r75, fitted.widthMultipliers[key]);
  }).length;
  return { ...base, ...errorMetric(observations.map(row => Math.abs(row.logError))), median_log_error: median(observations.map(row => row.logError)), band_coverage: covered / observations.length, band_nominal_coverage: BAND_TARGET_COVERAGE };
}

/**
 * Share of rows whose realized value lies between the `lowLevel` and `highLevel` quantiles of the residuals
 * ln(realized / predicted) of their own basis group. With `jackknife` each row is scored against the quantiles of the
 * other rows in its group, so a row cannot widen the band that is then said to contain it.
 */
export function residualBandCoverage(rows: Array<Pick<BacktestObservation, 'basis' | 'logError'>>, lowLevel: number, highLevel: number, jackknife = false) {
  const group = (row: Pick<BacktestObservation, 'basis'>) => row.basis === 'category';
  let covered = 0;
  rows.forEach((row, index) => {
    const residuals = rows.filter((other, otherIndex) => group(other) === group(row) && !(jackknife && otherIndex === index)).map(other => -other.logError);
    if (!residuals.length) return;
    const residual = -row.logError;
    if (residual >= quantile(residuals, lowLevel) && residual <= quantile(residuals, highLevel)) covered++;
  });
  return { count: rows.length, covered, coverage: rows.length ? covered / rows.length : 0 };
}

/** Leave-one-out log errors ln(predicted / realized) of a plain least-squares line ln(mcap) = a + b ln(TVL) over all tokenized peers. */
export function olsLooErrors(snapshot: Snapshot): number[] {
  const live = snapshot.protocols.filter(isLive);
  return live.map(peer => {
    const rest = live.filter(p => p.slug !== peer.slug);
    return rest.length ? olsLogError(rest, peer) : 0;
  });
}

/** ln(predicted / realized) market cap of `peer` under the least-squares line ln(mcap) = a + b ln(TVL) fitted on `rows`. */
function olsLogError(rows: SnapshotProtocol[], peer: SnapshotProtocol): number {
  const slope = leastSquaresSlope(rows);
  const meanX = rows.reduce((sum, p) => sum + Math.log(p.tvl_usd), 0) / rows.length;
  const meanY = rows.reduce((sum, p) => sum + Math.log(p.mcap_usd!), 0) / rows.length;
  return meanY + slope * (Math.log(peer.tvl_usd) - meanX) - Math.log(peer.mcap_usd!);
}

/**
 * The plain log-log OLS curve scored on the three protocols the shipped model is published on, over the same peers and
 * splits: leave-one-out (line refit without the held-out peer; the ablation's `ols` row), strict leave-one-out (those
 * errors recentred by the other peers' median, the strict protocol's bias correction) and walk-forward (line fitted on
 * the earlier half's peers only, the later half predicted once). Emitted with the model constants in 1-model.js.
 */
export function plainCurveValidation(snapshot: Snapshot) {
  const loo = olsLooErrors(snapshot);
  const { split, train } = walkForwardTrain(snapshot);
  const trainPeers = train.protocols.filter(isLive);
  return {
    loo: errorMetric(loo.map(Math.abs)),
    strict: errorMetric(recentreByOthers(loo).map(Math.abs)),
    walkForward: split.train.length && split.test.length ? errorMetric(split.test.map(peer => Math.abs(olsLogError(trainPeers, peer)))) : { median_absolute_log_error: null, error_factor: null }
  };
}

/**
 * Leave-one-out log errors of "category medians only": TVL times the median market-cap/TVL ratio of the other tokenized
 * peers in the same category, or of all other tokenized peers when the category has no other. No shrinkage, size
 * adjustment, factors, winsorizing or bias correction.
 */
export function categoryMedianLooErrors(snapshot: Snapshot): number[] {
  const live = snapshot.protocols.filter(isLive);
  const logRatio = (p: SnapshotProtocol) => Math.log(p.mcap_usd! / p.tvl_usd);
  return live.map(peer => {
    const rest = live.filter(p => p.slug !== peer.slug);
    const same = rest.filter(p => p.category !== null && p.category === peer.category);
    return median((same.length ? same : rest).map(logRatio)) - logRatio(peer);
  });
}

/**
 * The published validation of the shipped model. `shipped` is the build's own calibrated backtest (the observations the
 * board's bias correction and bands come from) and `slope` the size slope the board uses.
 */
export function validationReport(snapshot: Snapshot, shipped: ReturnType<typeof calibrateBacktest>, slope: number, variants: FactorVariants = {}) {
  const sizeAdjustment: SizeAdjustment = { mode: 'global', slope };
  const absolute = (rows: Array<{ logError: number }>) => rows.map(row => Math.abs(row.logError));
  const full = errorMetric(absolute(shipped.observations));
  // Strict variant: the size slope is refit inside every fold and each peer's bias correction is the median error of
  // the other peers, so neither constant has seen the held-out market cap.
  const strictRaw = backtest(snapshot, { sizeAdjustment, ...variants, refitSlope: true }).map(row => row.logError);
  const strict = recentreByOthers(strictRaw);
  const arm = (shapes: FactorShapes, adjustment: SizeAdjustment | undefined) => absolute(calibrateBacktest(snapshot, shapes, adjustment, variants).observations);
  const ablationRows: Array<[string, string, number[]]> = [
    ['full', 'Full shipped model', absolute(shipped.observations)],
    ['ols', 'Plain log-log OLS: ln(mcap) on ln(TVL)', olsLooErrors(snapshot).map(Math.abs)],
    ['no_growth', 'Shipped model without the growth factor', arm({ ...BASELINE_SHAPES, growth: 'G3' }, sizeAdjustment)],
    ['no_maturity', 'Shipped model without the maturity factor', arm({ ...BASELINE_SHAPES, maturity: 'M2' }, sizeAdjustment)],
    ['no_size', 'Shipped model without the size adjustment', arm(BASELINE_SHAPES, undefined)],
    ['category_medians', 'Category medians only', categoryMedianLooErrors(snapshot).map(Math.abs)]
  ];
  const shippedCovered = shipped.observations.filter(row => row.covered).length;
  const wideNominal = WIDE_BAND_QUANTILES.high - WIDE_BAND_QUANTILES.low;
  return {
    model: 'the shipped model: the same calibration, factors, size adjustment and bias correction the board is built with',
    metric: 'median over peers of |ln(predicted market cap / actual market cap)|; error_factor = e^metric; no clamping, no peer dropped',
    peers: shipped.observations.length,
    loo: {
      definition: 'leave-one-out over every tokenized peer (market cap > 0 and TVL > 0): calibration sets and factor normalizers are refit without the held-out peer; the size slope and the median bias correction are the full-sample constants the board ships',
      count: shipped.observations.length,
      ...full,
      strict: {
        definition: 'as above, but the size slope is refit in every fold and each peer is bias-corrected with the median error of the other peers',
        ...errorMetric(strict.map(Math.abs))
      }
    },
    walkForward: {
      definition: 'tokenized peers with a listing date, split at the median date (ties train); every fitted quantity comes from the earlier half only; the later half is predicted once',
      ...walkForward(snapshot, variants)
    },
    coverage: {
      definition: 'share of peers whose actual market cap lies inside the band around their leave-one-out prediction',
      bands: [
        { label: 'shipped low-high band', nominal_coverage: BAND_TARGET_COVERAGE, shipped: true, count: shipped.observations.length, covered: shippedCovered, coverage: shipped.observations.length ? shippedCovered / shipped.observations.length : 0, note: 'in-sample: the band quantiles and width multipliers are tuned on these same leave-one-out residuals to reach the nominal level', held_out: { definition: 'each peer scored against the residual quantiles of the other peers in its basis group', ...residualBandCoverage(shipped.observations, SHIPPED_BAND_QUANTILES.low, SHIPPED_BAND_QUANTILES.high, true) } },
        { label: 'wide band from the same residuals (not shown on the board)', nominal_coverage: wideNominal, shipped: false, quantiles: WIDE_BAND_QUANTILES, ...residualBandCoverage(shipped.observations, WIDE_BAND_QUANTILES.low, WIDE_BAND_QUANTILES.high), note: 'in-sample', held_out: { definition: 'each peer scored against the residual quantiles of the other peers in its basis group', ...residualBandCoverage(shipped.observations, WIDE_BAND_QUANTILES.low, WIDE_BAND_QUANTILES.high, true) } }
      ]
    },
    ablation: {
      definition: 'the same leave-one-out metric over the same peers for each variant; each model variant is recalibrated on its own (own bias correction); the OLS and category-median rows have no bias correction',
      rows: ablationRows.map(([key, label, errors]) => {
        const metric = errorMetric(errors);
        return { key, label, count: errors.length, ...metric, delta_vs_full: metric.median_absolute_log_error - full.median_absolute_log_error, beats_full: metric.median_absolute_log_error < full.median_absolute_log_error };
      })
    }
  };
}
