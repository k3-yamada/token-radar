import type { ModelConstants, Snapshot, SnapshotProtocol } from './types.ts';

const VERSIONED = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
const EXCLUDED_CATEGORIES = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
const EXCLUDED_NAME_WORDS = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return p.tvl_usd > 0 && isPreToken(p) && !EXCLUDED_CATEGORIES.has((p.category ?? '').toLowerCase()) && !VERSIONED.test(p.name) && !EXCLUDED_NAME_WORDS.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}

/**
 * The rows the board scores: every watchlist protocol with positive TVL, then the largest rankable
 * pre-token protocols by TVL (slug as tie-break, code-unit order) up to the early-row and board-size limits.
 * Single source for buildBoard and for the backtest's per-fold factor normalizers.
 */
export function selectScoredRows(snapshot: Snapshot, model: Pick<ModelConstants, 'early_rows' | 'board_max_rows'>): SnapshotProtocol[] {
  const index = new Map(snapshot.protocols.map(p => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p && p.tvl_usd > 0) chosen.set(slug, p);
  }
  const slots = Math.max(0, Math.min(model.early_rows, model.board_max_rows - chosen.size));
  const early = snapshot.protocols.filter(p => !chosen.has(p.slug) && isRankable(p)).sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, slots);
  for (const p of early) chosen.set(p.slug, p);
  return [...chosen.values()];
}
