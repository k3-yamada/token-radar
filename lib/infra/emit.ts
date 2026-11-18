import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BoardRow, RadarData } from '../domain/types.ts';

export function emit(output: string, board: BoardRow[], radar: RadarData): void {
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(output, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`);
}
