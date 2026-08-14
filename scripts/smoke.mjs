import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const reservePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : undefined;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });

const port = await reservePort();
assert.equal(typeof port, 'number');
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist-server/index.js', '--production'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', chunk => {
  output += chunk.toString();
});
child.stderr.on('data', chunk => {
  output += chunk.toString();
});

const waitForReady = async () => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited early.\n${output}`);
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
    } catch {
      // The process may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Server did not become ready.\n${output}`);
};

try {
  const frontend = await waitForReady();
  const html = await frontend.text();
  assert.match(frontend.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(frontend.headers.get('cache-control'), 'no-store');
  assert.match(frontend.headers.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(html, /<div id="root"><\/div>/);

  const assetPath = html.match(/(?:src|href)="(\.\/assets\/[^"]+)"/)?.[1];
  assert.ok(assetPath, 'Built HTML must reference at least one generated asset.');
  const asset = await fetch(new URL(assetPath, `${baseUrl}/`));
  assert.equal(asset.status, 200);

  const missingApi = await fetch(`${baseUrl}/api/quality-smoke-not-found`);
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get('content-type') ?? '', /^application\/json/);
  const missingApiBody = await missingApi.json();
  assert.equal(missingApiBody.error, 'API 경로를 찾을 수 없습니다.');
  assert.equal(missingApiBody.code, 'API_NOT_FOUND');
  assert.equal(missingApiBody.retryable, false);
  assert.match(missingApiBody.requestId, /^[0-9a-f-]{36}$/i);

  console.log(`Production smoke test passed at ${baseUrl}.`);
} finally {
  if (child.exitCode === null) child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }),
  ]);
}
