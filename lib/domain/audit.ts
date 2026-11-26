import { exclusionReason, isPreToken } from './eligibility.ts';
import type { Snapshot } from './types.ts';

export const BEYOND_ROW_LIMIT = 'rankable, beyond the board row limit';

/**
 * Where every snapshot protocol went. Tokenized and pre-token partition the snapshot; ranked and excluded partition
 * the pre-token protocols, the excluded ones grouped by the first eligibility rule they fail (`exclusionReason`).
 */
export function integrityAudit(snapshot: Snapshot, board: Array<{ slug: string }>) {
  const ranked = new Set(board.map(row => row.slug));
  const tokenized = snapshot.protocols.filter(p => !isPreToken(p));
  const preToken = snapshot.protocols.filter(isPreToken);
  const reasons = new Map<string, number>();
  for (const p of preToken) {
    if (ranked.has(p.slug)) continue;
    const reason = exclusionReason(p) ?? BEYOND_ROW_LIMIT;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  const excluded = [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || (a.reason < b.reason ? -1 : 1));
  const excludedTotal = excluded.reduce((sum, row) => sum + row.count, 0);
  const rankedPreToken = preToken.filter(p => ranked.has(p.slug)).length;
  const present = snapshot.watchlist.filter(slug => ranked.has(slug));
  return {
    total: snapshot.protocols.length,
    tokenized: tokenized.length,
    tokenized_calibration_peers: tokenized.filter(p => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0).length,
    tokenized_without_usable_market_cap: tokenized.filter(p => !(p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)).length,
    pre_token: preToken.length,
    ranked_rows: board.length,
    ranked_pre_token: rankedPreToken,
    excluded_pre_token: excludedTotal,
    excluded_pre_token_by_reason: excluded,
    watchlist: { required: snapshot.watchlist.length, present: present.length, missing: snapshot.watchlist.filter(slug => !ranked.has(slug)) },
    sums: {
      tokenized_plus_pre_token_equals_total: tokenized.length + preToken.length === snapshot.protocols.length,
      ranked_plus_excluded_equals_pre_token: rankedPreToken + excludedTotal === preToken.length,
      every_ranked_row_is_pre_token: rankedPreToken === board.length
    }
  };
}
