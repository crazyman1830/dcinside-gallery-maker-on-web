import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite';
import { initializeRuntime } from '../server/index';

describe('development server filesystem policy', () => {
  it('denies Vite defaults and project credential locations', async () => {
    const root = process.cwd();
    const config = await resolveConfig(
      { configFile: path.join(root, 'vite.config.ts') },
      'serve',
      'development',
    );
    const deniedRelativePaths = [
      '.env',
      '.env.local',
      'certificates/client.crt',
      'certificates/client.pem',
      'certificates/client.key',
      'certificates/client.p12',
      'certificates/client.pfx',
      'certificates/client.cer',
      'certificates/client.der',
      '.npmrc',
      '.yarnrc.yml',
      '.git/config',
      '.secrets/provider.json',
      'vertex/provider.json',
      'credentials/provider.json',
      'secrets/provider.json',
      'keys/service-account-production.json',
      'keys/google_service_account_production.json',
    ];

    for (const relativePath of deniedRelativePaths) {
      const absolutePath = normalizePath(path.resolve(root, relativePath));
      expect(isFileLoadingAllowed(config, absolutePath), relativePath).toBe(false);
    }

    expect(isFileLoadingAllowed(config, normalizePath(path.resolve(root, 'App.tsx')))).toBe(true);
  });
});

describe('server runtime mode', () => {
  it('sets NODE_ENV before creating a production Express app', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const { app, mode } = await initializeRuntime(
        ['node', 'dist-server/index.js', '--production'],
        false,
      );

      expect(mode).toBe('production');
      expect(process.env.NODE_ENV).toBe('production');
      expect(app.get('env')).toBe('production');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
