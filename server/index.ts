import { createServer } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HOST = '127.0.0.1';

export type RuntimeMode = 'development' | 'production';

export const resolveRuntimeMode = (argv: readonly string[] = process.argv): RuntimeMode =>
  argv.includes('--production') ? 'production' : 'development';

export const initializeRuntime = async (
  argv: readonly string[] = process.argv,
  serveFrontend = true,
) => {
  const mode = resolveRuntimeMode(argv);

  // Set the process mode before loading app.ts and its provider dependencies.
  process.env.NODE_ENV = mode;
  const [{ createApp }, { SESSION_TTL_MS, sessionCredentialStore }] = await Promise.all([
    import('./app'),
    import('./sessionStore'),
  ]);
  const app = await createApp({ mode, serveFrontend });

  return { app, mode, SESSION_TTL_MS, sessionCredentialStore };
};

export const startServer = async (argv: readonly string[] = process.argv) => {
  const { app, SESSION_TTL_MS, sessionCredentialStore } = await initializeRuntime(argv);
  const parsedPort = Number(process.env.PORT ?? 5173);
  const port =
    Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535 ? parsedPort : 5173;
  const server = createServer(app);
  const cleanupTimer = setInterval(() => sessionCredentialStore.cleanupExpired(), 60_000);
  cleanupTimer.unref();

  const shutdown = (): void => {
    clearInterval(cleanupTimer);
    sessionCredentialStore.clear();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.listen(port, HOST, () => {
    console.log(`DCInside Gallery Maker: http://${HOST}:${port}`);
    console.log(
      `Credentials remain in memory for at most ${SESSION_TTL_MS / 3_600_000} idle hours.`,
    );
  });

  return server;
};

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href) {
  await startServer();
}
