import { buildBoard, boardIssue } from '../domain/board.ts';
import { calibrate } from '../domain/calibration.ts';
import { MODEL, MODEL_VERSION, type BoardRow, type LiveRow, type RadarData, type RadarRow, type Snapshot } from '../domain/types.ts';
import { rankRanges } from '../domain/uncertainty.ts';
import { calibrateBacktest, factorChangeReport, gradeForBandRatio, summarizeBacktest, summarizeGradeBands, globalSizeAdjustment, selectionDiagnostics } from '../domain/backtest.ts';
import { median } from '../domain/statistics.ts';
import { BASELINE_SHAPES } from '../domain/estimate.ts';

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; rejection: string | null } {
  const sizeAdjustment = globalSizeAdjustment(snapshot);
  const factorReport = factorChangeReport(snapshot, { ...sizeAdjustment, mode: 'global' });
  const adoptedAmplitudes = factorReport.adopted_amplitudes ? factorReport.amplitudes : undefined;
  const unknownAge = factorReport.adopted_unknown_age ? factorReport.unknownAge : MODEL.unknown_listed_age_days;
  const calibration = calibrate(snapshot, sizeAdjustment);
  const modelCalibration = calibrateBacktest(snapshot, BASELINE_SHAPES, { mode: 'global', slope: sizeAdjustment.slope }, { fitAmplitudes: !!adoptedAmplitudes, derivedUnknownAge: factorReport.adopted_unknown_age });
  const diagnostics = selectionDiagnostics(modelCalibration.observations);
  const top10Bias = diagnostics.winner_curse.top10.top.median_log_error;
  const top10Obs = [...modelCalibration.observations].sort((a, b) => b.predictedValue - a.predictedValue || a.slug.localeCompare(b.slug)).slice(0, 10);
  const top10Slugs = new Set(top10Obs.map(row => row.slug));
  const shrinkErrors = modelCalibration.observations.map(row => row.logError - (top10Slugs.has(row.slug) ? top10Bias : 0));
  const shrunkTop10Mae = median(shrinkErrors.filter((_, index) => top10Slugs.has(modelCalibration.observations[index]!.slug)).map(Math.abs));
  const shrunkOverallMae = median(shrinkErrors.map(Math.abs));
  const baselineTop10Mae = diagnostics.winner_curse.top10.top.median_absolute_log_error;
  const baselineOverallMae = modelCalibration.summary.all.median_absolute_log_error;
  const shrinkAdopted = top10Bias >= .30 && shrunkTop10Mae < baselineTop10Mae && shrunkOverallMae <= baselineOverallMae * 1.01;
  const gradeMetrics = Object.fromEntries((['A', 'B', 'C'] as const).map(grade => {
    const summary = summarizeBacktest(modelCalibration.observations.filter(row => gradeForBandRatio(row.bandRatio, row.peerCount) === grade)).all;
    return [grade, summary.count ? summary : { ...summary, coverage: null, band_coverage: null, median_log_error: null, median_absolute_log_error: null }];
  }));
  const board = buildBoard(snapshot, MODEL, calibration, { biasFactor: modelCalibration.correctionFactor, bandMultipliers: modelCalibration.widthMultipliers, residualQuantiles: modelCalibration.residualQuantiles, sizeAdjustment, unknownAge });
  rankRanges(board, calibration);
  if (shrinkAdopted) {
    const factor = Math.exp(-top10Bias);
    for (const row of board.slice(0, 10)) {
      row.implied_value_usd = Math.max(1, Math.round(row.implied_value_usd * factor));
      row.value_low_usd = Math.max(1, Math.round(row.value_low_usd * factor));
      row.value_high_usd = Math.max(row.implied_value_usd, Math.round(row.value_high_usd * factor));
      row.model.base_usd = Math.max(1, Math.round(row.model.base_usd * factor));
    }
  }
  const calibrationPeers = snapshot.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const fullTop = new Set(board.slice(0, 20).map(r => r.slug));
  let overlapTotal = 0;
  for (const peer of calibrationPeers) {
    const reduced = { ...snapshot, protocols: snapshot.protocols.filter(p => p.slug !== peer.slug) };
    const top = buildBoard(reduced, MODEL).slice(0, 20);
    overlapTotal += top.filter(r => fullTop.has(r.slug)).length / Math.max(1, fullTop.size);
  }
  const top20JackknifeOverlap = calibrationPeers.length ? overlapTotal / calibrationPeers.length : 1;
  const rejection = boardIssue(board, snapshot);
  const live: LiveRow[] = snapshot.protocols.filter(p => !(p.mcap_usd === null && p.gecko_id === null && p.symbol === null) && p.category !== 'CEX').sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd).slice(0, MODEL.live_rows).map(p => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd,
    change_7d: p.change_7d
  }));
  const watchlist = new Set(snapshot.watchlist);
  const rows: RadarRow[] = board.map(r => ({
    rank: r.rank,
    rank_low: r.rank_low,
    rank_high: r.rank_high,
    slug: r.slug,
    name: r.name,
    category: r.category,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    mcap_usd: r.mcap_usd,
    listed_at: r.listed_at,
    age_days: r.age_days,
    implied_value_usd: r.implied_value_usd,
    value_low_usd: r.value_low_usd,
    value_high_usd: r.value_high_usd,
    ratio_basis: r.ratio_basis,
    ratio_live_count: r.ratio_live_count,
    confidence: r.confidence,
    growth_multiplier: r.model.growth_multiplier,
    maturity_multiplier: r.model.maturity_multiplier,
    category_ratio_used: r.model.category_ratio_used,
    category_ratio_source: r.model.category_ratio_source,
    base_usd: r.model.base_usd,
    chain_multiplier: 'none',
    farm_steps: r.farm_steps,
    watchlist: watchlist.has(r.slug),
    peer_token_share: r.peer_token_share,
    plan_capital_usd: r.plan_capital_usd,
    plan_fees_usd: r.plan_fees_usd,
    plan_weeks: r.plan_weeks
  }));

  return {
    board,
    radar: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model: { ...MODEL, unknown_listed_age_days: unknownAge, factor_normalization: `growth: 1 + 0.35 * (2 * percentile - 1); maturity: 0.75 + 0.5 * ln(1 + age_days) / ln(1 + 1460); factors are median-normalized across scored rows; unknown listed_at age is snapshot-derived (${unknownAge} days)`, growth_median_change_7d: calibration.medianChange },
      model_version: MODEL_VERSION,
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: board.filter(r => !watchlist.has(r.slug)).length,
      live_size: live.length,
      scanned_size: snapshot.protocols.length,
      rows,
      live,
      calibration: calibration.entries,
      calibration_backtest: { peers_evaluated: modelCalibration.summary.all.count, ...modelCalibration.summary.all, by_basis: modelCalibration.summary.by_basis },
      rank_quality: diagnostics.rank_quality,
      winner_curse: diagnostics.winner_curse,
      selection_shrink: { adopted: shrinkAdopted, top_n: 10, bias_log: top10Bias, baseline_top10_median_absolute_log_error: baselineTop10Mae, shrunk_top10_median_absolute_log_error: shrunkTop10Mae, baseline_overall_median_absolute_log_error: baselineOverallMae, shrunk_overall_median_absolute_log_error: shrunkOverallMae },
      grade_band_backtest: summarizeGradeBands(modelCalibration.observations),
      grade_backtest: gradeMetrics,
      bias_correction_factor: modelCalibration.correctionFactor,
      band_width_multipliers: modelCalibration.widthMultipliers,
      band_construction: 'residual',
      residual_quantiles: modelCalibration.residualQuantiles,
      size_adjustment_slope: sizeAdjustment.slope,
      ...(adoptedAmplitudes ? { fitted_factor_amplitudes: { growth: adoptedAmplitudes.growth, maturity: adoptedAmplitudes.maturity } } : {}),
      ...(factorReport.adopted_unknown_age ? { derived_unknown_listed_age_days: unknownAge } : {}),
      top20_jackknife_overlap: top20JackknifeOverlap
    },
    rejection
  };
}
