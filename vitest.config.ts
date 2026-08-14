import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: [
        'constants.ts',
        'hooks/**/*.ts',
        'schemas.ts',
        'server/**/*.ts',
        'services/**/*.ts',
        'utils/**/*.ts',
      ],
      exclude: ['server/index.ts'],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
        'schemas.ts': { lines: 90 },
        'hooks/useGalleryStorage.ts': { lines: 90 },
        'server/security.ts': { lines: 90 },
        'server/sessionStore.ts': { lines: 90 },
        'services/presetService.ts': { lines: 90 },
        'utils/jsonParser.ts': { lines: 90 },
      },
    },
  },
});
