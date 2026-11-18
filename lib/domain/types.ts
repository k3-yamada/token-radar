export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  quantile_method: string;
  shrinkage_k: number;
  tanh_scale: number;
  growth_weight: number;
  growth_center: string;
  growth_median_change_7d: number;
  maturity_min_factor: number;
  maturity_range: number;
  maturity_cap_days: number;
  unknown_listed_age_days: number;
  factor_normalization: string;
  calibration_exclusions: string;
  global_excluded_categories: string[];
  peer_token_share: string;
  chain_factor: string;
  farm_plan_totals: string;
  minimum_implied_value_usd: number;
  board_max_rows: number;
  early_rows: number;
  live_rows: number;
}

export const MODEL: ModelConstants = {
  quantile_method: 'type-7 linear interpolation',
  shrinkage_k: 6,
  tanh_scale: 50,
  growth_weight: .35,
  growth_center: 'percentile rank among all snapshot protocols reporting change_7d; missing change is neutral',
  growth_median_change_7d: 0,
  maturity_min_factor: .75,
  maturity_range: .5,
  maturity_cap_days: 1460,
  unknown_listed_age_days: 365,
  factor_normalization: 'growth: 1 + 0.35 * (2 * percentile - 1); maturity: 0.75 + 0.5 * ln(1 + age_days) / ln(1 + 1460); divide factors by their medians across scored rows',
  calibration_exclusions: 'exclude missing or non-positive market cap and non-positive TVL from all calibration sets; 16 snapshot protocols have market cap exactly 0',
  global_excluded_categories: ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'],
  peer_token_share: 'TVL with positive market cap / total category TVL; detail reports protocol counts',
  chain_factor: 'none (tested against the live set; no relation)',
  farm_plan_totals: 'capital=initial prescribed principal; fees=exact sum of stated step cost-range midpoints (3, 7, 4.5, 4.5 per activity week, 1.5, 6, 6.5); weeks=4 or 8 activity span',
  minimum_implied_value_usd: 1,
  board_max_rows: 200,
  early_rows: 160,
  live_rows: 24,
};

export const MODEL_VERSION = 'radar-12';

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface CalibrationSet {
  count: number;
  q25: number;
  median: number;
  centre?: number;
  q75: number;
}

export interface CalibrationEntry {
  category: string;
  live_count: number;
  median_ratio: number;
  p25_ratio: number;
  p75_ratio: number;
  statistics_label: 'raw set statistics';
  excluded_categories: string[];
  peer_tokenized_count: number;
  peer_total_count: number;
}

export interface Calibration {
  global: CalibrationSet;
  categories: Map<string, CalibrationSet>;
  entries: CalibrationEntry[];
  medianChange: number;
  peerCounts: Map<string, { tokenized: number; total: number }>;
  samples: Map<string, number[]>;
}

export interface BoardRow {
  rank: number;
  rank_low: number;
  rank_high: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  ratio_basis: 'category' | 'global-anchored' | 'global';
  ratio_live_count: number;
  confidence: 'A' | 'B' | 'C';
  peer_token_share: number;
  plan_capital_usd: number;
  plan_fees_usd: number;
  plan_weeks: number;
  model: {
    category_ratio_used: number;
    category_ratio_source: string;
    base_usd: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: 'none';
    age_days: number | null;
  };
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  rank_low: number;
  rank_high: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  ratio_basis: 'category' | 'global-anchored' | 'global';
  ratio_live_count: number;
  confidence: 'A' | 'B' | 'C';
  growth_multiplier: number;
  maturity_multiplier: number;
  category_ratio_used: number;
  category_ratio_source: string;
  base_usd: number;
  chain_multiplier: 'none';
  farm_steps: string[];
  watchlist: boolean;
  peer_token_share: number;
  plan_capital_usd: number;
  plan_fees_usd: number;
  plan_weeks: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  scanned_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  calibration: CalibrationEntry[];
  calibration_backtest: { peers_evaluated: number; band_coverage: number; median_log_error: number; median_absolute_log_error: number; by_basis: Record<string, { count: number; coverage: number; band_coverage: number; median_log_error: number; median_absolute_log_error: number }> };
  rank_quality: { spearman: number; top10_overlap: number };
  winner_curse: { top10: { top: { count: number; median_log_error: number; median_absolute_log_error: number }; rest: { count: number; median_log_error: number; median_absolute_log_error: number } }; top20: { top: { count: number; median_log_error: number; median_absolute_log_error: number }; rest: { count: number; median_log_error: number; median_absolute_log_error: number } } };
  selection_shrink: { adopted: boolean; top_n: number; bias_log: number; baseline_top10_median_absolute_log_error: number; shrunk_top10_median_absolute_log_error: number; baseline_overall_median_absolute_log_error: number; shrunk_overall_median_absolute_log_error: number };
  grade_band_backtest: Array<{ label: string; lower_exclusive: number; upper_inclusive: number | null; count: number; coverage: number; median_absolute_log_error: number | null }>;
  grade_backtest: Record<'A' | 'B' | 'C', { count: number; coverage: number | null; band_coverage: number | null; median_log_error: number | null; median_absolute_log_error: number | null }>;
  bias_correction_factor: number;
  band_width_multipliers: { category: number; global_anchored: number };
  band_construction: 'residual';
  residual_quantiles: { category: { r25: number; r75: number }; global_anchored: { r25: number; r75: number } };
  size_adjustment_slope: number;
  fitted_factor_amplitudes?: { growth: number; maturity: number };
  derived_unknown_listed_age_days?: number;
  top20_jackknife_overlap: number;
}
