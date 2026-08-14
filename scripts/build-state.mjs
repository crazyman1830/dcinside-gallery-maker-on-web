import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const statePath = path.join(root, 'dist', '.build-state.json');
const clientDistPath = path.join(root, 'dist');
const clientEntryPath = path.join(clientDistPath, 'index.html');
const serverEntryPath = path.join(root, 'dist-server', 'index.js');
const buildInputs = [
  'App.tsx',
  'components',
  'constants.ts',
  'context',
  'formOptions.ts',
  'hooks',
  'index.css',
  'index.html',
  'index.tsx',
  'package-lock.json',
  'package.json',
  'postcss.config.js',
  'schemas.ts',
  'server',
  'services',
  'tailwind.config.js',
  'tsconfig.json',
  'tsconfig.node.json',
  'tsconfig.server.json',
  'types.ts',
  'utils',
  'vite.config.ts',
];

const collectFiles = async target => {
  const absolutePath = path.join(root, target);
  const targetStat = await stat(absolutePath);
  if (targetStat.isFile()) return [target];

  const entries = await readdir(absolutePath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => collectFiles(path.join(target, entry.name))),
  );
  return nested.flat();
};

const calculateHash = async () => {
  const files = (await Promise.all(buildInputs.map(collectFiles)))
    .flat()
    .map(file => file.replaceAll('\\', '/'))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(path.join(root, file)));
    hash.update('\0');
  }
  return hash.digest('hex');
};

const collectOutputFiles = async directoryPath => {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async entry => {
      const outputPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) return collectOutputFiles(outputPath);
      return outputPath === statePath ? [] : [outputPath];
    }),
  );
  return nested.flat();
};

const calculateOutputManifest = async () => {
  await Promise.all([stat(clientEntryPath), stat(serverEntryPath)]);
  const outputPaths = [
    ...(await collectOutputFiles(clientDistPath)),
    ...(await collectOutputFiles(path.dirname(serverEntryPath))),
  ].sort();

  return Promise.all(
    outputPaths.map(async filePath => {
      const [content, metadata] = await Promise.all([readFile(filePath), stat(filePath)]);
      return {
        file: path.relative(root, filePath).replaceAll('\\', '/'),
        size: metadata.size,
        hash: createHash('sha256').update(content).digest('hex'),
      };
    }),
  );
};

const command = process.argv[2];
const hash = await calculateHash();

if (command === '--write') {
  const outputs = await calculateOutputManifest();
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify({ version: 2, hash, outputs }, null, 2)}\n`, 'utf8');
  console.log(`Build state recorded (${hash.slice(0, 12)}).`);
  process.exit(0);
}

if (command !== '--check') {
  console.error('Usage: node scripts/build-state.mjs --check|--write');
  process.exit(2);
}

try {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const outputs = await calculateOutputManifest();
  if (
    state.version === 2 &&
    state.hash === hash &&
    JSON.stringify(state.outputs) === JSON.stringify(outputs)
  ) {
    console.log('Production build is current.');
    process.exit(0);
  }
} catch {
  // Missing or malformed state means the production output must be rebuilt.
}

console.error('Production build is missing or stale.');
process.exit(1);
