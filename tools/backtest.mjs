import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSnapshot } from '../lib/infra/snapshot.ts';
import { runBacktest } from '../lib/app/runBacktest.ts';

const arg = process.argv[2] ?? 'snapshot.json';
const path = resolve(arg);
const snapshot = parseSnapshot(readFileSync(path, 'utf8'));
process.stdout.write(`${JSON.stringify(runBacktest(snapshot), null, 2)}\n`);
