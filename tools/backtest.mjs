// Usage: node --experimental-strip-types tools/backtest.mjs [snapshot.json]   (default: the kit snapshot)
import { loadSnapshot } from './_snapshot.mjs';
import { runBacktest } from '../lib/app/runBacktest.ts';

const snapshot = loadSnapshot();
process.stdout.write(`${JSON.stringify(runBacktest(snapshot), null, 2)}\n`);
