import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const kib = 1024;
const budgets = {
  clientCompressed: 180 * kib,
  clientJavaScriptGzip: 160 * kib,
  clientStylesheetGzip: 40 * kib,
  clientFontRaw: 300 * kib,
  clientTotalRaw: 800 * kib,
  serverEntryRaw: 120 * kib,
};

const listFiles = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async entry => {
      const fullPath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    }),
  );
  return files.flat();
};

const sum = values => values.reduce((total, value) => total + value, 0);
const formatKib = bytes => `${(bytes / kib).toFixed(1)} KiB`;
const root = process.cwd();
const clientFiles = await listFiles(path.join(root, 'dist'));
const fileSizes = await Promise.all(
  clientFiles.map(async file => ({
    file,
    raw: (await stat(file)).size,
    gzip: gzipSync(await readFile(file)).byteLength,
  })),
);
const serverEntryRaw = (await stat(path.join(root, 'dist-server', 'index.js'))).size;

const measurements = {
  clientCompressed: sum(
    fileSizes
      .filter(item => /\.(?:css|js|woff2?|ttf|otf|svg)$/i.test(item.file))
      .map(item => item.gzip),
  ),
  clientJavaScriptGzip: sum(
    fileSizes.filter(item => item.file.endsWith('.js')).map(item => item.gzip),
  ),
  clientStylesheetGzip: sum(
    fileSizes.filter(item => item.file.endsWith('.css')).map(item => item.gzip),
  ),
  clientFontRaw: sum(
    fileSizes.filter(item => /\.(?:woff2?|ttf|otf)$/i.test(item.file)).map(item => item.raw),
  ),
  clientTotalRaw: sum(fileSizes.map(item => item.raw)),
  serverEntryRaw,
};

let failed = false;
for (const [name, limit] of Object.entries(budgets)) {
  const actual = measurements[name];
  const status = actual <= limit ? 'PASS' : 'FAIL';
  console.log(`${status} ${name}: ${formatKib(actual)} / ${formatKib(limit)}`);
  if (actual > limit) failed = true;
}

if (failed) {
  console.error(
    'Bundle budget exceeded. Review the generated assets or adjust the budget deliberately.',
  );
  process.exit(1);
}
