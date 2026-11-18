import { calibrate, type CalibrationOptions } from './calibration.ts';
import { ageDays, BASELINE_SHAPES, changePercentiles, estimate, growthFactor, maturityFactor, type CentreEstimator, type FactorShapes } from './estimate.ts';
import { isRankable } from './eligibility.ts';
import { median, quantile } from './statistics.ts';
import { MODEL, type CalibrationSet, type Snapshot, type SnapshotProtocol } from './types.ts';

export interface BacktestObservation {
  slug: string;
  basis: 'category' | 'global-anchored' | 'global';
  covered: boolean;
  logError: number;
  lowLogDistance: number;
  highLogDistance: number;
  bandRatio: number;
  peerCount: number;
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
    return { ...row, predictedValue, realizedValue, logError, lowLogDistance: Math.log(predictedValue / low), highLogDistance: Math.log(high / predictedValue), covered: logError >= -Math.log(predictedValue / low) && logError <= Math.log(high / predictedValue), impliedLow: low, impliedHigh: high };
  });
  const bias = Math.exp(-median(joined.map(row => row.logError)));
  const corrected = joined.map(row => ({ ...row, predictedValue: row.predictedValue * bias, logError: row.logError + Math.log(bias) }));
  const widths = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category')),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category'))
  };
  const final = corrected.map(row => {
    const width = widths[row.basis === 'category' ? 'category' : 'global_anchored'];
    return { ...row, covered: row.logError >= -width * row.lowLogDistance && row.logError <= width * row.highLogDistance, bandRatio: Math.exp(width * (row.lowLogDistance + row.highLogDistance)) };
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

/** Matches the watchlist and early-row selection used by buildBoard. */
function boardScoredRows(snapshot: Snapshot): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map(p => [p.slug, p]));
  const selected = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const protocol = index.get(slug);
    if (protocol) selected.set(slug, protocol);
  }
  const slots = Math.max(0, Math.min(MODEL.early_rows, MODEL.board_max_rows - selected.size));
  const early = snapshot.protocols
    .filter(p => !selected.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || a.slug.localeCompare(b.slug))
    .slice(0, slots);
  for (const protocol of early) selected.set(protocol.slug, protocol);
  return [...selected.values()];
}

function factorNormalizers(snapshot: Snapshot, shapes: FactorShapes, model: typeof MODEL, unknownAge = model.unknown_listed_age_days): { growth: number; maturity: number } {
  const percentiles = changePercentiles(snapshot.protocols);
  const scored = boardScoredRows(snapshot);
  return {
    growth: median(scored.map(p => growthFactor(shapes.growth, p.change_7d, 0, model, percentiles.get(p.slug) ?? .5))) || 1,
    maturity: median(scored.map(p => maturityFactor(shapes.maturity, ageDays(snapshot.as_of, p.listed_at), model, unknownAge))) || 1
  };
}

export function derivedUnknownAge(snapshot: Snapshot): number {
  const ages = snapshot.protocols.map(p => ageDays(snapshot.as_of, p.listed_at)).filter((x): x is number => x !== null);
  return median(ages) || 0;
}

function fitFactorAmplitudes(snapshot: Snapshot, adjustment?: SizeAdjustment, unknownAge = derivedUnknownAge(snapshot)) {
  const live = snapshot.protocols.filter(isLive);
  const cal = calibrate(snapshot, adjustment ? { ...adjustment, center: adjustmentCenter(live.filter(p => !DERIVATIVE.has(p.category ?? ''))) } : undefined);
  const percentiles = changePercentiles(snapshot.protocols);
  const residuals: number[] = [], gx: number[] = [], mx: number[] = [];
  for (const p of live) {
    const set = p.category ? cal.categories.get(p.category) : undefined;
    const centre = set?.count ? (set.count === 1 ? (set.median + cal.global.median) / 2 : set.median) : cal.global.median;
    const raw = Math.log(p.mcap_usd! / p.tvl_usd);
    const size = adjustment ? adjustment.slope * (Math.log(p.tvl_usd) - (adjustment as SizeAdjustment & {center?:number}).center!) : 0;
    residuals.push(raw - size - centre);
    gx.push(Math.log(growthFactor('G2', p.change_7d, 0, MODEL, percentiles.get(p.slug) ?? .5)));
    mx.push(Math.log(maturityFactor('M1', ageDays(snapshot.as_of, p.listed_at), MODEL, unknownAge)));
  }
  const gc = median(gx), mc = median(mx), x = gx.map(v => v-gc), y = mx.map(v => v-mc);
  const fit = (z: number[]) => { const den=z.reduce((s,v)=>s+v*v,0); return den ? z.reduce((s,v,i)=>s+v*residuals[i]!,0)/den : 1; };
  return { growth: fit(x), maturity: fit(y), unknownAge };
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

export function backtest(snapshot: Snapshot, options: {
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
} = {}): BacktestObservation[] {
  const shapes = options.factorShapes ?? BASELINE_SHAPES;
  const model = options.model ?? MODEL;
  const factors = factorNormalizers(snapshot, shapes, model, options.derivedUnknownAge ? derivedUnknownAge(snapshot) : model.unknown_listed_age_days);
  const percentiles = changePercentiles(snapshot.protocols);
  const observations: BacktestObservation[] = [];

  for (const peer of snapshot.protocols.filter(isLive)) {
    const reducedOriginal = { ...snapshot, protocols: snapshot.protocols.filter(p => p.slug !== peer.slug) };
    const reduced = reducedOriginal;
    const unknownAge = options.derivedUnknownAge ? derivedUnknownAge(reduced) : MODEL.unknown_listed_age_days;
    const amplitudes = options.fitAmplitudes ? fitFactorAmplitudes(reduced, options.sizeAdjustment, unknownAge) : { growth: 1, maturity: 1, unknownAge };
    const params = adjustmentParameters(peer, reduced.protocols, options.sizeAdjustment);
    const calibration = calibrate(reduced, params, options.centreEstimator, options.calibrationOptions);
    const categorySet = peer.category ? calibration.categories.get(peer.category) : undefined;
    let selected: CalibrationSet = categorySet ?? { count: 0, q25: 0, median: 0, q75: 0 };
    if (options.peerWeighting === 'kernel' && peer.category && categorySet) {
      const peers = reduced.protocols.filter(p => isLive(p) && p.category === peer.category);
      const globalPeers = reduced.protocols.filter(p => isLive(p) && !DERIVATIVE.has(p.category ?? ''));
      const iqr = (values: number[]) => quantile(values, .75) - quantile(values, .25);
      const scale = (values: number[], fallback: number[]) => iqr(values) || iqr(fallback) || 1;
      const hT = scale(peers.map(p => Math.log(p.tvl_usd)), globalPeers.map(p => Math.log(p.tvl_usd)));
      const ageYears = (p: SnapshotProtocol) => (ageDays(snapshot.as_of, p.listed_at) ?? 365) / 365;
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
    const prediction = estimate(peer, snapshot.as_of, selected, calibration.global, model, calibration.medianChange, {
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
    const rawFactor = Math.exp(amplitudes.growth * Math.log(growthFactor(shapes.growth, peer.change_7d, 0, model, percentiles.get(peer.slug) ?? .5)) + amplitudes.maturity * Math.log(maturityFactor(shapes.maturity, ageDays(snapshot.as_of, peer.listed_at), model, unknownAge)));
    const normalization = (Math.log(factors.growth * factors.maturity) * (options.factorWeight ?? 1)) + Math.log(rawFactor) - Math.log(growthFactor(shapes.growth, peer.change_7d, 0, model, percentiles.get(peer.slug) ?? .5) * maturityFactor(shapes.maturity, ageDays(snapshot.as_of, peer.listed_at), model, unknownAge));
    const logError = Math.log(prediction.implied / peer.mcap_usd!) + normalization;
    const width = options.bandMultipliers?.[prediction.basis === 'category' ? 'category' : 'global_anchored'] ?? options.bandMultiplier ?? 1;
    const lowLogDistance = prediction.centre - prediction.q25;
    const highLogDistance = prediction.q75 - prediction.centre;
    const covered = logError >= -width * lowLogDistance && logError <= width * highLogDistance;
    const bandRatio = prediction.high / Math.max(1, prediction.low);
    observations.push({ slug: peer.slug, basis: prediction.basis, covered, logError, lowLogDistance, highLogDistance, bandRatio, peerCount: prediction.ratioCount, predictedValue: prediction.implied * Math.exp(normalization), realizedValue: peer.mcap_usd! });
  }
  return observations;
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

function bestBandMultiplier(rows: BacktestObservation[]): number {
  let best = .5;
  let closest = Infinity;
  for (let step = 50; step <= 300; step++) {
    const candidate = step / 100;
    const coverage = rows.length ? rows.filter(row => row.logError >= -candidate * row.lowLogDistance && row.logError <= candidate * row.highLogDistance).length / rows.length : 0;
    const distance = Math.abs(coverage - .5);
    if (distance < closest) {
      closest = distance;
      best = candidate;
    }
  }
  return best;
}

export function calibrateBacktest(snapshot: Snapshot, factorShapes: FactorShapes = BASELINE_SHAPES, sizeAdjustment?: SizeAdjustment, variants: { peerWeighting?: 'uniform' | 'kernel'; singlePeerBlend?: boolean; centreEstimator?: CentreEstimator; model?: typeof MODEL; shrinkage?: { base: number; min: number; max: number }; factorWeight?: number; fitAmplitudes?: boolean; derivedUnknownAge?: boolean; calibrationOptions?: CalibrationOptions } = {}) {
  const arm = (extra: { biasFactor?: number; bandMultipliers?: BandMultipliers } = {}) => backtest(snapshot, { factorShapes, sizeAdjustment, ...variants, ...extra });
  const uncorrected = arm();
  const correctionFactor = Math.exp(-median(uncorrected.map(row => row.logError)));
  const corrected = arm({ biasFactor: correctionFactor });
  const residualQuantiles: ResidualQuantiles = {
    category: (() => { const xs = corrected.filter(row => row.basis === 'category').map(row => -row.logError); return { r25: quantile(xs, .25), r75: quantile(xs, .75) }; })(),
    global_anchored: (() => { const xs = corrected.filter(row => row.basis !== 'category').map(row => -row.logError); return { r25: quantile(xs, .25), r75: quantile(xs, .75) }; })()
  };
  const widthMultipliers: BandMultipliers = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category').map(row => ({ ...row, lowLogDistance: residualQuantiles.category.r75, highLogDistance: -residualQuantiles.category.r25 }))),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category').map(row => ({ ...row, lowLogDistance: residualQuantiles.global_anchored.r75, highLogDistance: -residualQuantiles.global_anchored.r25 })))
  };
  const final = corrected.map(row => { const q = row.basis === 'category' ? residualQuantiles.category : residualQuantiles.global_anchored; const m = widthMultipliers[row.basis === 'category' ? 'category' : 'global_anchored']; const lowLogDistance = q.r75; const highLogDistance = -q.r25; const covered = row.logError >= -m * lowLogDistance && row.logError <= m * highLogDistance; return { ...row, lowLogDistance, highLogDistance, covered, bandRatio: Math.exp(m * (q.r75 - q.r25)) }; });
  return { correctionFactor, widthMultipliers, residualQuantiles, widthMultiplier: widthMultipliers.category, observations: final, summary: summarizeBacktest(final) };
}

export function factorChangeReport(snapshot: Snapshot, sizeAdjustment?: SizeAdjustment) {
  const arm = (fitAmplitudes: boolean, derivedUnknownAge: boolean) => calibrateBacktest(snapshot, BASELINE_SHAPES, sizeAdjustment, { fitAmplitudes, derivedUnknownAge });
  const metrics = (rows: BacktestObservation[]) => contestMetrics(rows);
  const base = arm(false, false);
  const fitted = arm(true, false);
  const chooseFit = fitted.summary.all.median_absolute_log_error <= base.summary.all.median_absolute_log_error * .97 && fitted.summary.first_half.median_absolute_log_error <= base.summary.first_half.median_absolute_log_error * 1.01 && fitted.summary.second_half.median_absolute_log_error <= base.summary.second_half.median_absolute_log_error * 1.01;
  const afterFit = chooseFit ? fitted : base;
  const unknown = arm(chooseFit, true);
  const chooseUnknown = unknown.summary.all.median_absolute_log_error <= afterFit.summary.all.median_absolute_log_error * 1.01;
  return { baseline: metrics(base.observations), fitted: metrics(fitted.observations), unknown_age: metrics(unknown.observations), adopted_amplitudes: chooseFit, adopted_unknown_age: chooseUnknown, selected: chooseUnknown ? unknown : afterFit, amplitudes: fitFactorAmplitudes(snapshot, sizeAdjustment) , unknownAge: derivedUnknownAge(snapshot) };
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

export function gradeForBandRatio(bandRatio: number, peerCount: number): 'A' | 'B' | 'C' {
  return peerCount >= 10 && bandRatio <= 10 ? 'A' : peerCount >= 5 && bandRatio <= 30 ? 'B' : 'C';
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

function contestArm(snapshot: Snapshot, adjustment?: SizeAdjustment, variants: { peerWeighting?: 'uniform' | 'kernel'; singlePeerBlend?: boolean } = {}) {
  const raw = backtest(snapshot, { sizeAdjustment: adjustment, ...variants });
  const correctionFactor = Math.exp(-median(raw.map(row => row.logError)));
  const corrected = backtest(snapshot, { sizeAdjustment: adjustment, ...variants, biasFactor: correctionFactor });
  const widths = {
    category: bestBandMultiplier(corrected.filter(row => row.basis === 'category')),
    global_anchored: bestBandMultiplier(corrected.filter(row => row.basis !== 'category'))
  };
  return summarizeBacktest(backtest(snapshot, { sizeAdjustment: adjustment, ...variants, biasFactor: correctionFactor, bandMultipliers: widths }));
}

export function measurementReport(snapshot: Snapshot) {
  const categorySlope = withinCategorySlope(snapshot) - 1;
  const globalAdjustment = globalSizeAdjustment(snapshot);
  const baseline = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope });
  const weighted = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope }, { peerWeighting: 'kernel' });
  const blended = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: globalAdjustment.slope }, { singlePeerBlend: true });
  const proxyCategories = new Map<string, number>();
  for (const row of snapshot.protocols.filter(isLive)) proxyCategories.set(row.category ?? 'Other', (proxyCategories.get(row.category ?? 'Other') ?? 0) + 1);
  const proxySlugs = new Set(snapshot.protocols.filter(isLive).filter(row => proxyCategories.get(row.category ?? 'Other') === 2).map(row => row.slug));
  const p0Rows = backtest(snapshot, { sizeAdjustment: { mode: 'global', slope: globalAdjustment.slope }, biasFactor: baseline.correctionFactor, bandMultipliers: baseline.widthMultipliers }).filter(row => proxySlugs.has(row.slug));
  const p1Rows = backtest(snapshot, { sizeAdjustment: { mode: 'global', slope: globalAdjustment.slope }, singlePeerBlend: true, biasFactor: blended.correctionFactor, bandMultipliers: blended.widthMultipliers }).filter(row => proxySlugs.has(row.slug));
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
