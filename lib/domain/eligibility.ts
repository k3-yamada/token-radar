import type { SnapshotProtocol } from './types.ts';

const VERSIONED = /\s(?:v\d+(?:\.\d+)*|\d+(?:\.\d+)+)$/i;
const EXCLUDED_CATEGORIES = new Set(['bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex']);
const EXCLUDED_NAME_WORDS = /\b(?:wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !EXCLUDED_CATEGORIES.has((p.category ?? '').toLowerCase()) && !VERSIONED.test(p.name) && !EXCLUDED_NAME_WORDS.test(p.name) && !EXCHANGE_PREFIX.test(p.name);
}
