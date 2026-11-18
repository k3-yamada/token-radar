import type { BoardRow, Calibration, CalibrationSet } from './types.ts';
import { quantile } from './statistics.ts';

export const RESAMPLE_COUNT = 200;
const SEED = 0x7b7a11;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function summarize(values: number[]): CalibrationSet {
  return { count: values.length, q25: quantile(values, .25), median: quantile(values, .5), q75: quantile(values, .75) };
}

/** Add reproducible rank intervals without changing any point estimate or point rank. */
export function rankRanges(board: BoardRow[], calibration: Calibration): void {
  const random = mulberry32(SEED);
  const ranks = new Map(board.map(row => [row.slug, [] as number[]]));
  const keys = [...calibration.samples.keys()];
  for (let iteration = 0; iteration < RESAMPLE_COUNT; iteration++) {
    const sampled = new Map<string, CalibrationSet>();
    for (const key of keys) {
      const source = calibration.samples.get(key)!;
      const values = Array.from({ length: source.length }, () => source[Math.floor(random() * source.length)]!);
      sampled.set(key, summarize(values));
    }
    const global = sampled.get('global') ?? { count: 0, q25: 0, median: 0, q75: 0 };
    const order = board.map(row => {
      const set = sampled.get(row.category ?? '') ?? { count: 0, q25: 0, median: 0, q75: 0 };
      const count = set.count;
      const weight = count ? count / (count + 6) : 0;
      const centre = count ? weight * set.median + (1 - weight) * global.median : global.median;
      const value = Math.max(1, Math.round(row.tvl_usd * Math.exp(centre) * row.model.growth_multiplier * row.model.maturity_multiplier));
      return { row, value };
    }).sort((a, b) => b.value - a.value || b.row.tvl_usd - a.row.tvl_usd || (a.row.slug < b.row.slug ? -1 : a.row.slug > b.row.slug ? 1 : 0));
    order.forEach((item, index) => ranks.get(item.row.slug)!.push(index + 1));
  }
  for (const row of board) {
    const values = ranks.get(row.slug)!;
    row.rank_low = Math.min(row.rank, Math.round(quantile(values, .05)));
    row.rank_high = Math.max(row.rank, Math.round(quantile(values, .95)));
  }
}
