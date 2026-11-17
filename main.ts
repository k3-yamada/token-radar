import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const TEXT_LIMIT = 65_536;
const IMAGE_LIMITS = { max: 4, max_bytes: 524_288 };
const ALLOWED_IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function option(name: string, defaultValue: string): string {
  const flag = `--${name}`;
  const position = process.argv.indexOf(flag);
  if (position !== -1 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const equalsForm = process.argv.find((value) => value.startsWith(`${flag}=`));
  return equalsForm === undefined ? defaultValue : equalsForm.slice(flag.length + 1);
}

function collectFlatFiles(source: string, destination: string): string[] {
  if (!existsSync(source)) return [];
  mkdirSync(destination, { recursive: true });
  const copiedNames: string[] = [];

  for (const entry of readdirSync(source)) {
    if (entry.startsWith('.')) continue;
    const sourcePath = join(source, entry);
    if (!statSync(sourcePath).isFile()) continue;
    copyFileSync(sourcePath, join(destination, entry));
    copiedNames.push(entry);
  }
  return copiedNames;
}

const inputSetting = option('input', '/input');
const snapshotPath = inputSetting.endsWith('.json') ? inputSetting : join(inputSetting, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  process.stderr.write(
    `token radar: no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input\n`,
  );
  process.exit(2);
}

const outputPath = option('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = parseSnapshot(readFileSync(snapshotPath, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const rejection = boardIssue(board, snapshot);
if (rejection !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${rejection}\n`);
  process.exit(1);
}

mkdirSync(outputPath, { recursive: true });
writeFileSync(join(outputPath, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(outputPath, 'data.js'), dataScript(radar));

collectFlatFiles(join(ROOT, 'dashboard'), join(outputPath, 'dashboard'));
const imageNames = collectFlatFiles(join(ROOT, 'screenshots'), join(outputPath, 'screenshots'));
if (imageNames.length < 3) {
  const noun = imageNames.length === 1 ? 'image' : 'images';
  process.stderr.write(
    `token radar: screenshots/ holds ${imageNames.length} ${noun}: hand in 3, the board, a detail view and a filtered view\n`,
  );
  process.exit(1);
}
for (const imageName of imageNames) {
  if (!ALLOWED_IMAGE_NAME.test(imageName)) {
    process.stderr.write(
      `token radar: screenshots/${imageName}: a name is letters, digits and . _ -, 1 to 128 characters\n`,
    );
    process.exit(1);
  }
}

writeFileSync(
  join(outputPath, 'dossier.json'),
  buildDossier(outputPath, {
    text_max_bytes: TEXT_LIMIT,
    screenshots: IMAGE_LIMITS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(outputPath, 'board.json')}, ${join(outputPath, 'data.js')}, ${join(outputPath, 'dashboard')} (3 files), ${join(outputPath, 'screenshots')} (${imageNames.length} images) and ${join(outputPath, 'dossier.json')}\n`,
);
