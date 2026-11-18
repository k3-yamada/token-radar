/** Type-7 quantiles: h=(n-1)p, with linear interpolation between adjacent order statistics. */
export function quantile(values: number[], p: number): number {
  if (!values.length) return 0;
  const xs = [...values].sort((a, b) => a - b);
  const h = (xs.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return xs[lo]! + (xs[hi]! - xs[lo]!) * (h - lo);
}

export function median(values: number[]): number {
  return quantile(values, .5);
}

export function interquartileRange(values: number[]): number {
  return quantile(values, .75) - quantile(values, .25);
}

export function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
