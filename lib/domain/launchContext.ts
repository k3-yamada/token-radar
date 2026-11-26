import { isPreToken } from './eligibility.ts';
import { ageDays } from './estimate.ts';
import type { Snapshot } from './types.ts';

const YEAR_DAYS = 365;
/** Bands of age since listing, in whole years of 365 days: lower bound inclusive, upper bound exclusive. */
export const AGE_BANDS = [
  { label: '<1y', min_years: 0, max_years: 1 },
  { label: '1-2y', min_years: 1, max_years: 2 },
  { label: '2-3y', min_years: 2, max_years: 3 },
  { label: '3-5y', min_years: 3, max_years: 5 },
  { label: '5y+', min_years: 5, max_years: null }
] as const;
export const UNKNOWN_AGE_BAND = 'unknown';

export function ageBand(age: number | null): string {
  if (age === null) return UNKNOWN_AGE_BAND;
  return AGE_BANDS.find(band => age >= band.min_years * YEAR_DAYS && (band.max_years === null || age < band.max_years * YEAR_DAYS))!.label;
}

/**
 * Context only: how many snapshot protocols of each listing-age band carry a token record today. This is a
 * cross-section, not a launch probability (protocols that have not launched yet are right-censored, and it says
 * nothing about when a token was issued), so it is never multiplied into a value or a rank.
 */
export function launchContext(snapshot: Snapshot, rows: Array<{ slug: string; age_days: number | null }>) {
  const bands = [...AGE_BANDS.map(band => band.label), UNKNOWN_AGE_BAND].map(label => {
    const members = snapshot.protocols.filter(p => ageBand(ageDays(snapshot.as_of, p.listed_at)) === label);
    const withToken = members.filter(p => !isPreToken(p)).length;
    return { band: label, n: members.length, with_token_record: withToken, share_with_token_record: members.length ? withToken / members.length : null };
  });
  const byLabel = new Map(bands.map(band => [band.band, band]));
  return {
    label: 'context only: a cross-sectional count, not a launch probability; never multiplied into value or rank',
    definition: 'age = days from listed_at to as_of, in bands of 365-day years; token record = the snapshot carries a market cap, a symbol or a Gecko ID; protocols without listed_at form the unknown band',
    total: snapshot.protocols.length,
    bands,
    rows: Object.fromEntries(rows.map(row => {
      const band = byLabel.get(ageBand(row.age_days))!;
      return [row.slug, { band: band.band, n: band.n, share_with_token_record: band.share_with_token_record }];
    }))
  };
}
