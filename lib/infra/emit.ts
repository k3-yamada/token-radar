import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardRow, RadarData } from '../domain/types.ts';

/**
 * `JSON.stringify` writes NaN and Infinity as `null` without complaint. This walks a structure before it is written and
 * throws on the first non-finite number, naming where it sits (for example `radar.rows[3].implied_value_usd`).
 */
export function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`emit: ${path} is ${value}, not a finite number`);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) assertFiniteNumbers(item, `${path}.${key}`);
}

export function emit(output: string, board: BoardRow[], radar: RadarData): void {
  assertFiniteNumbers(board, 'board.rows');
  assertFiniteNumbers(radar, 'radar');
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(output, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`);
}
