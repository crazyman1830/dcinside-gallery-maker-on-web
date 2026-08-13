import { createServer } from 'node:http';
import { createApp } from './app';
import { SESSION_TTL_MS, sessionCredentialStore } from './sessionStore';

const HOST = '127.0.0.1';
const parsedPort = Number(process.env.PORT ?? 5173);
const PORT = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65_535
  ? parsedPort
  : 5173;

const mode = process.argv.includes('--production') ? 'production' : 'development';
const app = await createApp({ mode });
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
server.listen(PORT, HOST, () => {
  console.log(`DCInside Gallery Maker: http://${HOST}:${PORT}`);
  console.log(`Credentials remain in memory for at most ${SESSION_TTL_MS / 3_600_000} idle hours.`);
});
