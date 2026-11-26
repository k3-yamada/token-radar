import type { Calibration, CalibrationEntry, CalibrationSet, Snapshot, StatisticsLabel } from './types.ts';
import { median, quantile } from './statistics.ts';
import { adjustLogRatio, estimateCentre, type CentreEstimator } from './estimate.ts';

const DERIVATIVE = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** The default winsor bounds, as fractions of the global log-ratio distribution. `calibrate` reports the pair it used as `winsor`. */
export const WINSOR_DEFAULT: [number, number] = [.01, .99];

export interface CalibrationOptions { exclusions?: string[]; winsor?: [number, number]; adjustGlobal?: boolean }
export function calibrate(snapshot: Snapshot, sizeAdjustment?: { slope: number; center: number; quad?: number }, centreEstimator: CentreEstimator = 'median', options: CalibrationOptions = {}): Calibration {
  const excluded = new Set(options.exclusions ?? [...DERIVATIVE]);
  const live = snapshot.protocols.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const logs = live.map(p => adjustLogRatio(Math.log(p.mcap_usd! / p.tvl_usd), Math.log(p.tvl_usd), sizeAdjustment?.center ?? 0, sizeAdjustment ? -sizeAdjustment.slope : 0, sizeAdjustment ? -(sizeAdjustment.quad ?? 0) : 0));
  const summarize = (xs: number[]): CalibrationSet => ({
    count: xs.length,
    q25: quantile(xs, .25),
    median: median(xs),
    centre: estimateCentre(xs, centreEstimator),
    q75: quantile(xs, .75)
  });
  const globalRows = live.filter(p => !excluded.has(p.category ?? ''));
  const globalTotal = snapshot.protocols.filter(p => !excluded.has(p.category ?? '')).length;
  const globalLogs = globalRows.map(p => options.adjustGlobal
    ? adjustLogRatio(Math.log(p.mcap_usd! / p.tvl_usd), Math.log(p.tvl_usd), sizeAdjustment?.center ?? 0, sizeAdjustment ? -sizeAdjustment.slope : 0, sizeAdjustment ? -(sizeAdjustment.quad ?? 0) : 0)
    : Math.log(p.mcap_usd! / p.tvl_usd));
  const [lowP, highP] = options.winsor ?? WINSOR_DEFAULT;
  const lower = lowP === 0 ? -Infinity : quantile(globalLogs, lowP);
  const upper = highP === 1 ? Infinity : quantile(globalLogs, highP);
  const clamp = (value: number) => Math.max(lower, Math.min(upper, value));
  const global = summarize(globalLogs.map(clamp));
  const samples = new Map<string, number[]>();
  samples.set('global', globalLogs.map(clamp));
  const groups = new Map<string, number[]>();

  for (let i = 0; i < live.length; i++) {
    const c = live[i]!.category;
    if (c) {
      const xs = groups.get(c) ?? [];
      xs.push(clamp(logs[i]!));
      groups.set(c, xs);
    }
  }

  // The label states what each entry's statistics were computed from. Both sets are winsorized to the global
  // percentile range; what differs is the size adjustment, applied to category logs whenever one is passed and to
  // the global logs only under `adjustGlobal` (off in production).
  const categoryLabel: StatisticsLabel = sizeAdjustment ? 'size-adjusted set statistics' : 'raw set statistics';
  const globalLabel: StatisticsLabel = sizeAdjustment && options.adjustGlobal ? 'size-adjusted set statistics' : 'raw set statistics';
  const categories = new Map<string, CalibrationSet>();
  const entries: CalibrationEntry[] = [];
  for (const [category, xs] of groups) {
    samples.set(category, [...xs]);
    const s = summarize(xs);
    categories.set(category, s);
    entries.push({
      category,
      live_count: s.count,
      median_ratio: Math.exp(s.median),
      p25_ratio: Math.exp(s.q25),
      p75_ratio: Math.exp(s.q75),
      statistics_label: categoryLabel,
      excluded_categories: [],
      peer_tokenized_count: s.count,
      peer_total_count: snapshot.protocols.filter(p => p.category === category).length
    });
  }

  entries.push({
    category: 'global',
    live_count: global.count,
    median_ratio: Math.exp(global.median),
    p25_ratio: Math.exp(global.q25),
    p75_ratio: Math.exp(global.q75),
    statistics_label: globalLabel,
    excluded_categories: [...excluded],
    peer_tokenized_count: globalRows.length,
    peer_total_count: globalTotal
  });

  const peerCounts = new Map<string, { tokenized: number; total: number }>();
  for (const p of snapshot.protocols) {
    const c = p.category ?? 'Other';
    const x = peerCounts.get(c) ?? { tokenized: 0, total: 0 };
    x.total++;
    if (p.mcap_usd !== null && p.mcap_usd > 0) x.tokenized++;
    peerCounts.set(c, x);
  }

  return {
    global,
    categories,
    entries,
    medianChange: median(snapshot.protocols.map(p => p.change_7d).filter((v): v is number => v !== null)),
    peerCounts,
    samples,
    winsor: [lowP, highP]
  };
}
