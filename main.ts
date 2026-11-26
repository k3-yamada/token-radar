import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRadar } from './lib/app/buildBoard.ts';
import { option } from './lib/infra/cli.ts';
import { emit } from './lib/infra/emit.ts';
import { parseSnapshot, SnapshotError } from './lib/infra/snapshot.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import { modelFigures, modelScript } from './modelFigures.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_LIMIT = 65536;
const IMAGE_LIMITS = { max: 4, max_bytes: 524288 };
const ALLOWED_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** An expected failure: `main` prints its message without a stack trace and exits with its code. */
class BuildFailure extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'BuildFailure';
    this.exitCode = exitCode;
  }
}

/** The regular, non-dot files directly inside `source`; flat by design, like the dashboard's layout. */
function listFlatFiles(source: string): string[] {
  if (!existsSync(source)) return [];
  return readdirSync(source).filter(entry => !entry.startsWith('.') && statSync(join(source, entry)).isFile());
}

function sameDirectory(a: string, b: string): boolean {
  return existsSync(a) && existsSync(b) && realpathSync(a) === realpathSync(b);
}

/**
 * Copies `source`'s flat files into `destination`, which is removed first so a file that has left the source cannot
 * survive a re-run and be packaged into the dossier. A destination that is the source itself is left alone.
 */
function collectFlatFiles(source: string, destination: string): string[] {
  const names = listFlatFiles(source);
  if (!existsSync(source) || sameDirectory(source, destination)) return names;
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const name of names) copyFileSync(join(source, name), join(destination, name));
  return names;
}

function main(): void {
  const inputSetting = option(process.argv, 'input', '/input');
  const snapshotPath = inputSetting.endsWith('.json') ? inputSetting : join(inputSetting, 'snapshot.json');
  if (!existsSync(snapshotPath)) throw new BuildFailure(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  const outputPath = option(process.argv, 'output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
  const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));

  // The screenshots are checked at their source, before anything is written.
  const screenshotsSource = join(ROOT, 'screenshots');
  const sourceImageNames = listFlatFiles(screenshotsSource);
  if (sourceImageNames.length < 3) {
    const noun = sourceImageNames.length === 1 ? 'image' : 'images';
    throw new BuildFailure(`screenshots/ holds ${sourceImageNames.length} ${noun}: hand in 3, the board, a detail view and a filtered view`, 1);
  }
  for (const imageName of sourceImageNames) if (!ALLOWED_IMAGE_NAME.test(imageName)) throw new BuildFailure(`screenshots/${imageName}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);

  const { board, radar, rejection } = buildRadar(snapshot);
  if (rejection !== null) throw new BuildFailure(`the model wrote a board the gate refuses: ${rejection}`, 1);

  emit(outputPath, board, radar);
  const dashboardNames = collectFlatFiles(join(ROOT, 'dashboard'), join(outputPath, 'dashboard'));
  // dashboard/model.js holds the fitted constants the dashboard's chain() recomputes values from; it is written from this
  // build's own snapshot, over the committed copy, so the shipped page always matches the board beside it.
  writeFileSync(join(outputPath, 'dashboard', 'model.js'), modelScript(modelFigures(snapshot, board, radar)));
  const imageNames = collectFlatFiles(screenshotsSource, join(outputPath, 'screenshots'));
  writeFileSync(join(outputPath, 'dossier.json'), buildDossier(outputPath, { text_max_bytes: TEXT_LIMIT, screenshots: IMAGE_LIMITS, dashboard: { max_files: 400, max_bytes: 4194304 } }));
  process.stdout.write(`token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\ntoken radar: wrote ${join(outputPath, 'board.json')}, ${join(outputPath, 'data.js')}, ${join(outputPath, 'dashboard')} (${dashboardNames.length} files), ${join(outputPath, 'screenshots')} (${imageNames.length} images) and ${join(outputPath, 'dossier.json')}\n`);
}

try {
  main();
} catch (error) {
  // A bad snapshot exits 2, like a missing one; every other build or gate failure (the dossier builder's, the emit
  // guard's, the file system's) exits 1. Only the message is printed.
  const exitCode = error instanceof BuildFailure ? error.exitCode : error instanceof SnapshotError ? 2 : 1;
  process.stderr.write(`token radar: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(exitCode);
}
