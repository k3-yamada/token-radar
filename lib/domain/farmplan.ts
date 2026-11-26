import type { FarmStep, SnapshotProtocol } from './types.ts';

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s += " Check the protocol's page and record the transaction.";
  return s;
}

/** The one deposit figure of a plan: every step that names an amount uses this value. */
export function planCapital(p: SnapshotProtocol): number {
  return p.tvl_usd >= 5e9 ? 250 : p.tvl_usd >= 1e9 ? 150 : p.tvl_usd >= 1e8 ? 100 : 50;
}

/** Activity span: 8 weeks for a protocol younger than a year, else 4. */
export function planWeeks(age: number | null): number {
  return age !== null && age < 365 ? 8 : 4;
}

/** Step executions of a plan: each one-off step once, each weekly step once per activity week. */
export function stepExecutions(steps: FarmStep[], weeks: number): number {
  return steps.reduce((sum, step) => sum + (step.weekly ? weeks : 1), 0);
}

/** fees = step executions x the midpoint of the assumed gas range, the same per-execution gas every step states. */
export function farmTotals(p: SnapshotProtocol, age: number | null): { capital: number; fees: number; weeks: number } {
  const weeks = planWeeks(age);
  const executions = stepExecutions(farmSteps(p, age), weeks);
  return { capital: planCapital(p), fees: executions * (FARM_ASSUMPTIONS.gas_usd_per_step_low + FARM_ASSUMPTIONS.gas_usd_per_step_high) / 2, weeks };
}

/**
 * ASSUMPTIONS, not snapshot data. The snapshot carries no gas price, no time-per-action and no wage, so every figure
 * `farmEconomics` derives rests on these named constants and is emitted beside them.
 */
export const FARM_ASSUMPTIONS = {
  label: 'assumptions: the snapshot contains none of these figures',
  gas_usd_per_step_low: 1,
  gas_usd_per_step_high: 8,
  minutes_per_step: 15,
  value_of_time_usd_per_hour: 30,
  airdrop_share_of_launch_value: .1,
  allocation_rule: 'pro rata to the plan capital as a share of protocol TVL'
} as const;
export type FarmAssumptions = { gas_usd_per_step_low: number; gas_usd_per_step_high: number; minutes_per_step: number; value_of_time_usd_per_hour: number; airdrop_share_of_launch_value: number };

/**
 * Cost, time and break-even of a plan under `assumptions`.
 * step_executions = one-off steps + each weekly step once per activity week, read from the steps' own `weekly` flags.
 * hours = step_executions * minutes_per_step / 60, which is the sum of the steps' stated times (each step states
 * minutes_per_step); time_cost = hours * value of time.
 * cost_low/high = step_executions * gas low/high + time_cost. The plan capital is working capital, not a cost.
 * break_even_implied_value = cost / (capital / TVL * airdrop share): the launch value at which a pro-rata allocation
 * repays the cost. break_even_share_of_implied_value = cost / the row's implied value: the fraction of the model's
 * estimate this wallet would have to receive, which needs no allocation assumption.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, impliedValue: number | null = null, assumptions: FarmAssumptions = FARM_ASSUMPTIONS) {
  const capital = planCapital(p);
  const executions = stepExecutions(farmSteps(p, age), planWeeks(age));
  const hours = executions * assumptions.minutes_per_step / 60;
  const timeCost = hours * assumptions.value_of_time_usd_per_hour;
  const gasLow = executions * assumptions.gas_usd_per_step_low;
  const gasHigh = executions * assumptions.gas_usd_per_step_high;
  const costLow = gasLow + timeCost;
  const costHigh = gasHigh + timeCost;
  const walletShare = p.tvl_usd > 0 ? capital / p.tvl_usd * assumptions.airdrop_share_of_launch_value : 0;
  const breakEven = (cost: number) => walletShare > 0 ? cost / walletShare : null;
  const shareOfImplied = (cost: number) => impliedValue !== null && impliedValue > 0 ? cost / impliedValue : null;
  return {
    step_executions: executions,
    hours,
    gas_usd_low: gasLow,
    gas_usd_high: gasHigh,
    time_cost_usd: timeCost,
    cost_usd_low: costLow,
    cost_usd_high: costHigh,
    break_even_implied_value_usd_low: breakEven(costLow),
    break_even_implied_value_usd_high: breakEven(costHigh),
    break_even_share_of_implied_value_low: shareOfImplied(costLow),
    break_even_share_of_implied_value_high: shareOfImplied(costHigh)
  };
}

/**
 * What a category's farm plan asks for, in plan order: the check made before any deposit, the deposit or first
 * action with the plan's one amount `a`, and the action repeated each week. Templates describe the category's own
 * qualifying activity; they name no protocol feature, token, rate or programme that the snapshot does not carry.
 */
type Template = { risk: string; action: string; weekly: string };
type Ctx = { n: string; c: string; a: string; all: string };
const holdWeekly = ({ n, c }: Ctx) => `Open your ${n} position on ${c}; check its balance, and claim or compound rewards if the app offers it.`;
const TEMPLATES: [RegExp, string, (x: Ctx) => Template][] = [
  [/leveraged farm/, 'leveraged farming', ({ n, c, a }) => ({
    risk: `Before opening a position on ${n}, read the leverage limits, borrow rate and liquidation rules for ${c}, and plan to use 2x leverage or less on the ${a}.`,
    action: `Open one ${a} leveraged farming position on ${n} on ${c} at low leverage, in a pool the app lists.`,
    weekly: `Open your ${n} position on ${c}; check the debt ratio and the distance to liquidation, and harvest rewards or reduce leverage if the app allows it.` })],
  [/index/, 'index', ({ n, c, a }) => ({
    risk: `Before buying, open the index's page in ${n}'s app on ${c} and check what it holds, the fees it charges and how redemption works.`,
    action: `Buy or mint ${a} of one ${n} index token on ${c} through the app and hold it in the same wallet.`,
    weekly: `Check the index position in ${n} on ${c}, and make one small mint or redemption within the same ${a}.` })],
  [/cdp/, 'CDP', ({ n, c, a }) => ({
    risk: `Before depositing collateral in ${n} on ${c}, check the collateral ratio, liquidation ratio and stability or borrow fee, and plan to mint no more than a quarter of the ${a} in debt.`,
    action: `Deposit ${a} of a supported collateral asset in ${n} on ${c}; then mint a small amount of debt against it and repay it, so the position shows both sides.`,
    weekly: `Open your ${n} position on ${c}, check the collateral ratio and fees, and make one small mint, repay or top-up within the same ${a}.` })],
  [/lend|collateral|credit|money market/, 'lending', ({ n, c, a }) => ({
    risk: `Before supplying or borrowing on ${n} on ${c}, check the collateral factor, liquidation threshold, health factor and borrow rate for USDC, and plan to borrow no more than a quarter of the ${a}.`,
    action: `Supply ${a} USDC to ${n} on ${c}; then make a small borrow and repay it to create both sides of a lending position.`,
    weekly: `Open your ${n} position on ${c}, check the health factor and rates, and make one small supply, borrow or repay within the same ${a}.` })],
  [/dex|swap|exchange/, 'DEX/swap', ({ n, c, a }) => ({
    risk: `Before adding liquidity on ${n}, choose one active pool on ${c}, check its fee tier and price range, and estimate the impermanent loss a ${a} position would take if one asset moved 20%.`,
    action: `Put ${a} into that ${n} pool on ${c}: swap about half of it through ${n} into the pool's second asset, then add a balanced portion of both to the liquidity pool.`,
    weekly: `Check your ${n} pool position on ${c}; collect accrued fees, or rebalance the range if the price has left it, inside the same ${a}.` })],
  [/perpet|derivative|futures|option/, 'perps/derivatives', ({ n, c, a }) => ({
    risk: `Before depositing margin on ${n}, read the leverage limits, liquidation rules and trading and funding fees the app shows on ${c}, and plan to use 2x leverage or less.`,
    action: `Deposit ${a} USDC as margin on ${n} on ${c}, open a small low-leverage hedge, then close it after checking the fee charged.`,
    weekly: `Open and close one small low-leverage trade on ${n} on ${c} from the same ${a} margin, and review the fees paid.` })],
  [/curator|vault/, 'curator/vault', ({ n, c, a }) => ({
    risk: `Before depositing, review slashing terms and curator permissions for the ${n} vault on ${c}, the markets it allocates to and its withdrawal delay; if any of these is unclear, stop here and keep the ${a}.`,
    action: `Deposit ${a} of the vault's asset into one ${n} vault on ${c} and keep the receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/staking|restak|validator/, 'staking', ({ n, c, a }) => ({
    risk: `Before staking with ${n} on ${c}, check the lockup and unbonding period and any slashing terms, and confirm you can leave the ${a} staked that long.`,
    action: `Stake ${a} of the supported asset with ${n} on ${c} and keep the receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/yield/, 'yield', ({ n, c, a }) => ({
    risk: `Before depositing, check which strategy the ${n} product on ${c} runs, the fees it takes and its withdrawal terms, and confirm the ${a} can stay there for the whole plan.`,
    action: `Deposit ${a} of the supported asset in ${n} on ${c} and keep the receipt token in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/bridge|cross.chain/, 'bridge/cross-chain', ({ n, c, a, all }) => ({
    risk: `Before bridging, confirm in ${n}'s app that both chains you will use are supported (${all}), and check the fee quote and expected arrival time.`,
    action: `Bridge ${a} of USDC through ${n} from ${c} to a second supported chain, then use part of it in an app on the destination chain.`,
    weekly: `Send one small transfer of the same funds through ${n} between supported chains (${all}) and confirm receipt before sending more.` })],
  [/rwa|real.world/, 'RWA', ({ n, c, a }) => ({
    risk: `Before subscribing, read the ${n} product terms: who holds the underlying real-world asset, the minimum subscription, the redemption window, and whether your country qualifies; if the minimum is above ${a}, stop here.`,
    action: `Complete any identity check ${n}'s app requires, then subscribe ${a} of the stablecoin it accepts into one tokenized real-world-asset product on ${c} and hold the token in the same wallet.`,
    weekly: `Open ${n} on ${c}, check the token balance and the yield or distribution accrued, and claim it if the app shows a claim.` })],
  [/capital allocator/, 'onchain capital allocator', ({ n, c, a }) => ({
    risk: `Before depositing, read where ${n} allocates deposited capital, who can change that allocation, and how and when withdrawals are paid on ${c}.`,
    action: `Deposit ${a} of the stablecoin ${n} accepts into its deposit product on ${c} and keep the receipt token in the same wallet.`,
    weekly: `Open your ${n} position on ${c}; check its value and the current allocation, and claim or compound rewards if the app offers it.` })],
  [/basis/, 'basis trading', ({ n, c, a }) => ({
    risk: `Before depositing, read how ${n} runs its basis trade: where the hedge positions are held, what happens to returns when funding turns negative, and how long redemption takes on ${c}.`,
    action: `Mint or deposit ${a} into ${n}'s basis-trade product on ${c} with a stablecoin the app accepts, and stake the result in the app if staking is offered.`,
    weekly: `Open your ${n} position on ${c}; check the balance and the return the app reports, and claim or restake rewards if the app offers it.` })],
  [/liquidity manager/, 'liquidity manager', ({ n, c, a }) => ({
    risk: `Before depositing, check which pool and fee tier the ${n} strategy uses on ${c}, the manager's fee, and the impermanent loss the position can take.`,
    action: `Deposit ${a} into one ${n}-managed liquidity strategy on ${c} and keep the receipt token; the strategy manages the price range for you.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/farm/, 'farm', ({ n, c, a }) => ({
    risk: `Before depositing, check which pool the ${n} farm on ${c} uses, how its rewards are paid and any deposit or withdrawal fee.`,
    action: `Deposit ${a} into one ${n} farm on ${c}, first adding the pool's assets as liquidity if the farm asks for LP tokens, and keep the receipt in the same wallet.`,
    weekly: `Open your ${n} farm on ${c} and harvest or compound the rewards earned.` })],
  [/btc|bitcoin/, 'BTC', ({ n, c, a }) => ({
    risk: `Before minting, read how ${n} secures the bitcoin behind its token: who controls custody, how redemption back to native BTC works, and what it costs.`,
    action: `Mint ${a} of ${n}'s BTC token through its app, or buy it on ${c}, and hold it in the same wallet.`,
    weekly: `Open ${n} on ${c}, check the BTC token balance, and stake it or claim rewards if ${n}'s app lists that option.` })],
  [/stablecoin/, 'stablecoin', ({ n, c, a }) => ({
    risk: `Before minting, read what backs ${n}'s stablecoin on ${c}, how redemption works and what it costs, and check that it currently trades close to $1.`,
    action: `Mint or wrap ${a} of ${n}'s stablecoin on ${c} through its app, and stake or deposit it in the app if that option is listed.`,
    weekly: `Open ${n} on ${c}, check the stablecoin balance and its price against $1, and claim or compound any yield the app shows.` })],
  [/^chain$/, 'chain', ({ n, a }) => ({
    risk: `Before bridging, find ${n}'s official bridge from its own website, and check the fee and how long a withdrawal back takes.`,
    action: `Bridge ${a} of USDC onto ${n} through its official bridge, then make one swap in an app running on ${n}.`,
    weekly: `Make one small swap, deposit or transfer on ${n} with the bridged funds, in an app you have checked.` })],
  [/cedefi/, 'CeDeFi', ({ n, c, a }) => ({
    risk: `Before depositing, read which part of ${n} is custodial and which is on-chain on ${c}, the identity check it requires, and how withdrawals are paid.`,
    action: `Deposit ${a} into ${n}'s on-chain product on ${c} from the dedicated wallet and keep any receipt token in that wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/card/, 'card', ({ n, c, a }) => ({
    risk: `Before topping up, read ${n}'s identity check, card fees and spending limits, and who holds the topped-up funds.`,
    action: `Top up your ${n} card with ${a} of a supported stablecoin from the dedicated wallet on ${c}, then make one card purchase.`,
    weekly: `Make one card purchase with ${n} from the same top-up, and check that it shows in the app.` })],
  [/governance/, 'governance incentives', ({ n, c, a }) => ({
    risk: `Before depositing, read how ${n} pays incentives on ${c}, any lock period on deposited tokens, and how rewards are claimed.`,
    action: `Deposit ${a} of a governance or liquidity token that ${n} supports on ${c}, and direct its vote or incentives through the app.`,
    weekly: `Open ${n} on ${c}; claim the incentives earned and direct the vote again if a new round has started.` })],
  [/insurance/, 'insurance', ({ n, c, a }) => ({
    risk: `Before depositing, read ${n}'s cover terms on ${c}: which events pay out, who decides claims, and any lock on deposited capital.`,
    action: `Deposit ${a} as capital in one ${n} cover or underwriting pool on ${c} and keep the receipt in the same wallet.`,
    weekly: holdWeekly({ n, c, a, all: '' }) })],
  [/otc/, 'OTC', ({ n, c, a }) => ({
    risk: `Before trading, read how ${n} settles trades on ${c}: whether funds sit in escrow, who can cancel an order, and the fee.`,
    action: `Make one ${a} trade on ${n} on ${c}: fill an existing listing, or post a small offer and let it fill.`,
    weekly: `Check open offers on ${n} on ${c}, and fill or post one small offer within the same ${a}.` })],
  [/payment/, 'payments', ({ n, c, a }) => ({
    risk: `Before sending, check which assets ${n} supports on ${c} and the fee per payment.`,
    action: `Send a ${a} payment through ${n} on ${c} to a second wallet you control, and confirm it arrives.`,
    weekly: `Send one small payment from the same ${a} through ${n} on ${c} between your two wallets.` })],
  [/prediction/, 'prediction market', ({ n, c, a }) => ({
    risk: `Before depositing, read the resolution rules and liquidity of the markets on ${n}, and whether your country may trade there.`,
    action: `Deposit ${a} of USDC into ${n} on ${c} and buy shares in one market with part of it.`,
    weekly: `Buy or sell shares in one market on ${n} on ${c} with the same deposit, and review your open positions.` })]
];
/** Only for a category no template matches; no row of the sealed snapshot uses it. */
const DEFAULT_TEMPLATE = ({ n, c, a }: Ctx): Template => ({
  risk: `Before depositing, read ${n}'s documentation for what its main on-chain action does on ${c}, who can upgrade the contracts and how to exit.`,
  action: `Deposit ${a} into ${n}'s main on-chain product on ${c} and keep any receipt token in the same wallet.`,
  weekly: `Open your ${n} position on ${c} and make one small transaction within the same ${a}, such as a claim, swap or top-up.`
});

/** The template group a category falls in, or 'default' when none matches. */
export function farmGroup(category: string | null): string {
  const c = (category ?? '').toLowerCase();
  return TEMPLATES.find(([re]) => re.test(c))?.[1] ?? 'default';
}

/**
 * The farm plan, in the order it is done: open the app, check the risks, deposit, repeat weekly, governance, exit.
 * Every amount is `planCapital`; every step states `minutes_per_step` and the assumed gas range, so the plan's
 * executions, hours and costs are the sums of what the steps say.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const c = p.chains[0] ?? 'its main chain';
  const all = p.chains.length ? p.chains.join(', ') : 'its main chain';
  const n = p.name;
  const a = `$${planCapital(p)}`;
  const weeks = planWeeks(age);
  const category = (p.category ?? '').toLowerCase();
  const make = TEMPLATES.find(([re]) => re.test(category))?.[2] ?? DEFAULT_TEMPLATE;
  const t = make({ n, c, a, all });
  const gas = `gas about $${FARM_ASSUMPTIONS.gas_usd_per_step_low}-$${FARM_ASSUMPTIONS.gas_usd_per_step_high} on ${c}`;
  const minutes = `${FARM_ASSUMPTIONS.minutes_per_step} minutes`;
  return [
    { text: `Open ${n}'s official app on ${c}, connect a dedicated wallet, and confirm the network and contract shown by the app before signing.`, cost: `$0 to connect; ${gas} for the first token approval`, time: minutes },
    { text: `${t.risk} If this wallet holds token approvals it no longer needs, revoke them.`, cost: `$0 to read; ${gas} for each approval you revoke`, time: minutes },
    { text: t.action, cost: `${a} of working capital, returned when you exit, plus ${gas} and any protocol fee the app shows before you confirm`, time: minutes },
    { text: `Once a week for ${weeks} weeks: ${t.weekly[0]!.toLowerCase()}${t.weekly.slice(1)} Record each transaction hash, date, amount and fee.`, cost: `${gas} per visit; no new capital`, time: `${minutes} each week, ${weeks} times`, weekly: true },
    { text: `Once during the plan, check ${n}'s governance forum or official community for an open proposal or a published points rule, then cast an eligible vote or leave a specific question using the same wallet.`, cost: `$0 to read or post; ${gas} for an on-chain vote`, time: minutes },
    { text: `At the end of week ${weeks}, review the position and any official ${n} rewards or points page for this wallet, then withdraw what remains of the ${a} on ${c} and record the final transaction.`, cost: gas, time: minutes }
  ];
}
