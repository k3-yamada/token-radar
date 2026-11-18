import type { FarmStep, SnapshotProtocol } from './types.ts';

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s += " Check the protocol's page and record the transaction.";
  return s;
}

export function farmTotals(p: SnapshotProtocol, age: number | null): { capital: number; fees: number; weeks: number } {
  const amount = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
  const weeks = age !== null && age < 365 ? 8 : 4;
  return { capital: amount, fees: 3 + 7 + 4.5 + 4.5 * weeks + 1.5 + 6 + 6.5, weeks };
}

function group(p: SnapshotProtocol): 'lending' | 'DEX/swap' | 'perps/derivatives' | 'yield/staking' | 'bridge/cross-chain' | 'other' {
  const c = (p.category ?? '').toLowerCase();
  if (/lend|cdp|collateral|credit|money market/.test(c)) return 'lending';
  if (/dex|swap|exchange/.test(c)) return 'DEX/swap';
  if (/perpet|derivative|futures|option/.test(c)) return 'perps/derivatives';
  if (/yield|staking|restak|vault|curator/.test(c)) return 'yield/staking';
  if (/bridge|cross.chain/.test(c)) return 'bridge/cross-chain';
  return 'other';
}

export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = p.chains[0] ?? 'its main chain';
  const allChains = p.chains.length ? p.chains.join(', ') : 'its main chain';
  const name = p.name;
  const amount = p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
  const g = group(p);
  const actions: Record<string, string> = {
    lending: `Supply $${amount} USDC to ${name} on ${chain}; then make a small borrow and repay it to create both sides of a lending position.`,
    'DEX/swap': `Swap $${amount} of a major asset through ${name} on ${chain}, then add a balanced portion to one active liquidity pool.`,
    'perps/derivatives': `Deposit $${amount} USDC as margin on ${name} on ${chain}, open a small low-leverage hedge, then close it after checking fees.`,
    'yield/staking': `Deposit or stake $${amount} of the supported asset in ${name} on ${chain} and keep the receipt token in the same wallet.`,
    'bridge/cross-chain': `Bridge $${amount} of USDC through ${name} from ${chain} to a second supported chain (${allChains}); use a small remainder in the destination app.`,
    other: `Make a $${amount} deposit or other supported on-chain action in ${name} on ${chain}, following the app's own instructions.`
  };
  const pool = g === 'lending' ? `Adjust the USDC supply in ${name} on ${chain} once this week and check the borrow rate before borrowing.` : g === 'DEX/swap' ? `Add or rebalance $${Math.min(amount, 50)} in a ${name} liquidity pool on ${chain}; check price range and fee tier first.` : g === 'perps/derivatives' ? `On ${name} on ${chain}, make one additional small hedge trade and close it; keep leverage low and review trading fees.` : g === 'yield/staking' ? `On ${name} on ${chain}, compound or restake once if the app supports it; otherwise add $${Math.min(amount, 50)} to the position.` : g === 'bridge/cross-chain' ? `Send a second small transfer through ${name} between supported chains (${allChains}) and confirm receipt before bridging more.` : `Repeat one small supported action in ${name} on ${chain}, such as a swap, deposit, or market interaction.`;
  const c = (p.category ?? '').toLowerCase();
  const risk = /lend|cdp|collateral|credit|money market/.test(c) ? `Before supplying or borrowing, check liquidation thresholds and health factor for this lending position; keep at least $50 uncommitted to reduce liquidation risk.` : /exchange|dex|swap|liquidity/.test(c) ? `Before adding liquidity, check the pool's price range and estimate impermanent loss; limit the position to $50 until you understand its exposure.` : /staking|restak|validator/.test(c) ? `Before staking, check the lockup and unbonding period and keep $50 liquid for fees or near-term needs.` : /curator|vault/.test(c) ? `Before depositing, review slashing terms and curator permissions; cap the test deposit at $50 until the vault risks are clear.` : `Before signing, review smart-contract permissions and revoke unused token approvals; budget $2-$10 for review and cleanup transactions.`;

  return [
    { text: `Open ${name}'s official app on ${chain}, connect a dedicated wallet, and confirm the network and contract shown by the app before signing.`, cost: '$0 to connect; allow $1-$5 for an initial approval or gas fee', time: '10-15 minutes' },
    { text: actions[g]!, cost: `$${amount} of working capital plus roughly $2-$12 in gas or trading fees on ${chain}`, time: '15-30 minutes' },
    { text: pool, cost: `$${Math.min(amount, 50)}-$${Math.min(amount, 100)} additional activity; about $1-$8 in fees`, time: '10-20 minutes weekly' },
    { text: `Repeat the category's qualifying activity in ${name} on ${chain} each week for ${age !== null && age < 365 ? '8' : '4'} weeks; review rates, slippage, and fees before each transaction.`, cost: 'about $1-$8 per visit on ' + chain, time: '10 minutes weekly' },
    { text: `Check ${name}'s governance forum or official community for a proposal or points rule, then cast an eligible vote or leave a specific question using the same wallet on ${chain}.`, cost: 'usually $0-$3 gas on ' + chain, time: '15-30 minutes monthly' },
    { text: risk, cost: 'up to $2-$10 in review or cleanup gas', time: '10-15 minutes before depositing' },
    { text: `Record each ${name} transaction hash, date, amount, and fees; review the position and any official rewards page before withdrawing on ${chain}.`, cost: '$0 to track; withdrawal may cost $1-$12 gas on ' + chain, time: '5 minutes weekly; 10-20 minutes to unwind' }
  ];
}
