import type { BoardRow, Calibration, ModelConstants, Snapshot } from './types.ts';
import { selectScoredRows } from './eligibility.ts';
import { calibrate } from './calibration.ts';
import { estimate, changePercentiles } from './estimate.ts';
import { farmSteps, farmTotals, stepText } from './farmplan.ts';
import { median, round4 } from './statistics.ts';
import { gradeForBandRatio } from './backtest.ts';

export function buildBoard(snapshot: Snapshot, model: ModelConstants, cal: Calibration = calibrate(snapshot), calibrationOptions: { biasFactor?: number; bandMultiplier?: number; bandMultipliers?: { category: number; global_anchored: number }; residualQuantiles?: { category: { r25: number; r75: number }; global_anchored: { r25: number; r75: number } }; sizeAdjustment?: { slope: number; center: number }; unknownAge?: number; amplitudes?: { growth: number; maturity: number }; light?: boolean } = {}): BoardRow[] {
  const percentiles = changePercentiles(snapshot.protocols);

  const scored = selectScoredRows(snapshot, model).map(p => {
    const raw = p.category ? cal.categories.get(p.category) : undefined;
    const basis = raw?.count === 1 ? 'global_anchored' : raw?.count ? 'category' : 'global_anchored';
    const v = estimate(p, snapshot.as_of, raw ?? { count: 0, q25: 0, median: 0, q75: 0 }, cal.global, model, cal.medianChange, { factorShapes: { growth: 'G2', maturity: 'M1' }, changePercentile: percentiles.get(p.slug) ?? .5, categorySamples: p.category ? cal.samples.get(p.category) : undefined, globalSamples: cal.samples.get('global'), ...calibrationOptions, residualQuantiles: calibrationOptions.residualQuantiles?.[basis], bandMultiplier: calibrationOptions.bandMultipliers?.[basis] ?? calibrationOptions.bandMultiplier });
    return { p, v };
  });
  const growthMedian = median(scored.map(x => x.v.growthMult));
  const maturityMedian = median(scored.map(x => x.v.maturityMult));
  for (const x of scored) {
    x.v.growthMult /= growthMedian;
    x.v.maturityMult /= maturityMedian;
    x.v.factor = x.v.growthMult * x.v.maturityMult;
    const bias = calibrationOptions.biasFactor ?? 1;
    x.v.implied = Math.max(1, Math.round(x.p.tvl_usd * Math.exp(x.v.centre) * x.v.factor * bias));
    x.v.low = Math.min(x.v.implied, Math.max(1, Math.round(x.p.tvl_usd * Math.exp(x.v.q25) * x.v.factor * bias)));
    x.v.high = Math.max(x.v.implied, Math.round(x.p.tvl_usd * Math.exp(x.v.q75) * x.v.factor * bias));
  }
  scored.sort((a, b) => b.v.implied - a.v.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  return scored.map(({ p, v }, i) => {
    const confidence: BoardRow['confidence'] = gradeForBandRatio(v.high / v.low, v.ratioCount);
    const plan = calibrationOptions.light ? { capital: 0, fees: 0, weeks: 0 } : farmTotals(p, v.age);
    return {
      rank: i + 1,
      rank_low: i + 1,
      rank_high: i + 1,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'pre-token',
      age_days: v.age,
      implied_value_usd: v.implied,
      value_low_usd: v.low,
      value_high_usd: v.high,
      ratio_basis: v.basis,
      ratio_live_count: v.ratioCount,
      confidence,
      peer_token_share: calibrationOptions.light ? 0 : (() => { const members = snapshot.protocols.filter(x => (x.category ?? 'Other') === (p.category ?? 'Other')); const total = members.reduce((sum, x) => sum + x.tvl_usd, 0); return total ? members.reduce((sum, x) => sum + (x.mcap_usd !== null && x.mcap_usd > 0 ? x.tvl_usd : 0), 0) / total : 0; })(),
      plan_capital_usd: plan.capital,
      plan_fees_usd: plan.fees,
      plan_weeks: plan.weeks,
      model: {
        category_ratio_used: round4(v.ratio),
        category_ratio_source: v.basis === 'global' ? 'global' : p.category!,
        base_usd: Math.round(v.base * (calibrationOptions.biasFactor ?? 1)),
        growth_pct: v.growthPct,
        growth_multiplier: round4(v.growthMult),
        maturity_multiplier: round4(v.maturityMult),
        chain_multiplier: 'none',
        age_days: v.age
      },
      farm_steps: calibrationOptions.light ? [] : farmSteps(p, v.age).map(stepText)
    };
  });
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  for (const r of board) {
    if (r.symbol != null || r.gecko_id != null) return `${r.slug} carries a token symbol or Gecko ID`;
    if (r.value_low_usd > r.implied_value_usd || r.implied_value_usd > r.value_high_usd) return `${r.slug} has an invalid value band`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  return null;
}
