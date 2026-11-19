import type { CalibrationSet, ModelConstants, SnapshotProtocol } from './types.ts';
import { interquartileRange, median } from './statistics.ts';

const DAY_MS = 86400000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function effectiveShrinkageK(set: CalibrationSet, global: CalibrationSet, categorySamples?: number[], globalSamples?: number[], base = 6, min = 2, max = 24): number {
  if (set.count < 4 || !categorySamples || !globalSamples) return base;
  const denominator = interquartileRange(globalSamples);
  if (!denominator) return base;
  return Math.max(min, Math.min(max, base * interquartileRange(categorySamples) / denominator));
}

/** Blend category and global calibration centres with the production shrinkage rule. */
export function blendedCalibrationCentre(set: CalibrationSet, global: CalibrationSet, categorySamples?: number[], globalSamples?: number[], shrinkage = { base: 6, min: 2, max: 24 }): number {
  const count = set.count;
  if (!count) return global.centre ?? global.median;
  const k = effectiveShrinkageK(set, global, categorySamples, globalSamples, shrinkage.base, shrinkage.min, shrinkage.max);
  const weight = count / (count + k);
  return weight * (set.centre ?? set.median) + (1 - weight) * (global.centre ?? global.median);
}

export type FactorShapes = { growth: 'G1' | 'G2' | 'G3'; maturity: 'M1' | 'M2' };
export const BASELINE_SHAPES: FactorShapes = { growth: 'G2', maturity: 'M1' };
export function adjustLogRatio(logRatio: number, logTvl: number, medianLogTvl: number, ratioSlope: number, quad = 0): number {
  const x = logTvl - medianLogTvl;
  return logRatio + ratioSlope * x + quad * x * x;
}
export function growthFactor(shape: FactorShapes['growth'], change: number | null, medianChange: number, model: ModelConstants, percentile = 0.5): number {
  if (shape === 'G3') return 1;
  if (shape === 'G2') return 1 + model.growth_weight * (2 * percentile - 1);
  return 1 + model.growth_weight * Math.tanh(((change ?? medianChange) - medianChange) / model.tanh_scale);
}
export function maturityFactor(shape: FactorShapes['maturity'], age: number | null, model: ModelConstants, unknownAge = model.unknown_listed_age_days): number {
  if (shape === 'M2') return 1;
  return model.maturity_min_factor + model.maturity_range * Math.log1p(Math.min(age ?? unknownAge, model.maturity_cap_days)) / Math.log1p(model.maturity_cap_days);
}
export function changePercentiles(protocols: SnapshotProtocol[]): Map<string, number> {
  const rows = protocols.filter(p => p.change_7d !== null).slice().sort((a, b) => a.change_7d! - b.change_7d!);
  const result = new Map<string, number>();
  for (let start = 0; start < rows.length;) {
    let end = start + 1;
    while (end < rows.length && rows[end]!.change_7d === rows[start]!.change_7d) end++;
    const averageRank = ((start + 1) + end) / 2;
    const percentile = rows.length === 1 ? .5 : (averageRank - 1) / (rows.length - 1);
    for (let i = start; i < end; i++) result.set(rows[i]!.slug, percentile);
    start = end;
  }
  return result;
}

export type CentreEstimator = 'median' | 'trimmed-mean' | 'huber-mean';
export function estimateCentre(values: number[], estimator: CentreEstimator = 'median'): number {
  if (!values.length || estimator === 'median') return median(values);
  const sorted = [...values].sort((a, b) => a - b);
  if (estimator === 'trimmed-mean') {
    if (sorted.length < 5) return median(sorted);
    const trim = Math.floor(sorted.length * .1);
    const kept = sorted.slice(trim, sorted.length - trim);
    return kept.reduce((sum, value) => sum + value, 0) / kept.length;
  }
  const mad = median(sorted.map(value => Math.abs(value - median(sorted))));
  const scale = mad ? 1.4826 * mad : 1;
  let centre = median(sorted);
  for (let i = 0; i < 3; i++) {
    const limit = 1.345 * scale;
    centre = sorted.map(value => Math.max(centre - limit, Math.min(centre + limit, value)))
      .reduce((sum, value) => sum + value, 0) / sorted.length;
  }
  return centre;
}

export function estimate(p: SnapshotProtocol, asOf: string, set: CalibrationSet, global: CalibrationSet, model: ModelConstants, medianChange: number, options: { categorySamples?: number[]; globalSamples?: number[]; biasFactor?: number; bandMultiplier?: number; residualQuantiles?: { r25: number; r75: number }; factorShapes?: FactorShapes; changePercentile?: number; sizeAdjustment?: { slope: number; center: number; quad?: number }; singlePeerBlend?: boolean; centreEstimator?: CentreEstimator; shrinkage?: { base: number; min: number; max: number }; amplitudes?: { growth: number; maturity: number }; unknownAge?: number } = {}) {
  const count = set.count;
  const basis: 'category' | 'global-anchored' | 'global' = count === 1 ? 'global-anchored' : count ? 'category' : 'global';
  const shrinkage = options.shrinkage ?? { base: 6, min: 2, max: 24 };
  const k = effectiveShrinkageK(set, global, options.categorySamples, options.globalSamples, shrinkage.base, shrinkage.min, shrinkage.max);
  const w = count ? count / (count + k) : 0;
  const age = ageDays(asOf, p.listed_at);
  const growthPct = p.change_7d ?? medianChange;
  const shapes = options.factorShapes ?? BASELINE_SHAPES;
  const growthMult = growthFactor(shapes.growth, p.change_7d, medianChange, model, options.changePercentile);
  const maturityMult = maturityFactor(shapes.maturity, age, model, options.unknownAge);
  const amplitudes = options.amplitudes ?? { growth: 1, maturity: 1 };
  const poweredGrowth = Math.exp(amplitudes.growth * Math.log(growthMult));
  const poweredMaturity = Math.exp(amplitudes.maturity * Math.log(maturityMult));
  const factor = poweredGrowth * poweredMaturity;
  const blend = (value: number, globalValue: number) => options.singlePeerBlend && count === 1
    ? (value + globalValue) / 2
    : count ? w * value + (1 - w) * globalValue : globalValue;
  const calibrationQ25 = blend(set.q25, global.q25);
  const calibrationCentre = options.singlePeerBlend && count === 1
    ? ((set.centre ?? set.median) + (global.centre ?? global.median)) / 2
    : blendedCalibrationCentre(set, global, options.categorySamples, options.globalSamples, shrinkage);
  const calibrationQ75 = blend(set.q75, global.q75);
  const adjust = (value: number) => options.sizeAdjustment
    ? adjustLogRatio(value, Math.log(p.tvl_usd), options.sizeAdjustment.center, options.sizeAdjustment.slope, options.sizeAdjustment.quad)
    : value;
  const q25 = adjust(calibrationQ25);
  const centre = adjust(calibrationCentre);
  const q75 = adjust(calibrationQ75);
  const bias = options.biasFactor ?? 1;
  const band = options.bandMultiplier ?? 1;
  const lowLog = options.residualQuantiles ? centre + band * options.residualQuantiles.r25 : centre + (q25 - centre) * band;
  const highLog = options.residualQuantiles ? centre + band * options.residualQuantiles.r75 : centre + (q75 - centre) * band;
  const point = p.tvl_usd * Math.exp(centre) * factor * bias;
  const low = p.tvl_usd * Math.exp(lowLog) * factor * bias;
  const high = p.tvl_usd * Math.exp(highLog) * factor * bias;
  const implied = Math.max(1, Math.round(point));

  return {
    age,
    growthPct,
    growthMult: poweredGrowth,
    maturityMult: poweredMaturity,
    chainMult: 'none' as const,
    factor,
    ratioCount: count,
    blendWeight: w,
    basis,
    centre,
    q25: lowLog,
    q75: highLog,
    ratio: Math.exp(centre),
    base: p.tvl_usd * Math.exp(centre),
    implied,
    low: Math.min(implied, Math.max(1, Math.round(low))),
    high: Math.max(implied, Math.round(high))
  };
}
