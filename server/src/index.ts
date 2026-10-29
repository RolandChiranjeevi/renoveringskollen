import { buildApp } from './app.ts';
import { BackupService } from './backup/backupService.ts';
import { purgeExpiredSessions } from './auth/sessions.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/client.ts';
import { FileStore } from './storage/files.ts';

const config = loadConfig();
const { db, close, snapshot } = openDb(config.databasePath);
purgeExpiredSessions(db);

const app = buildApp(
  {
    db,
    files: new FileStore(config.uploadsDir),
    backups: new BackupService({
      backupDir: config.backupDir,
      uploadsDir: config.uploadsDir,
      snapshotDb: snapshot,
    }),
    cookies: { secure: config.cookieSecure },
    webDist: config.webDist,
    allowRemoteSetup: process.env.SETUP_ALLOW_REMOTE === 'true',
  },
  { logger: true, trustProxy: config.trustProxy },
);

const shutdown = async () => {
  await app.close();
  close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ host: config.host, port: config.port });
  const local = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
  if (!local && !config.cookieSecure) {
    app.log.warn(
      'Servern nås från nätverket men COOKIE_SECURE är inte på. Använd HTTPS (t.ex. Tailscale Serve eller Caddy) ' +
        'och sätt COOKIE_SECURE=true – annars kan inloggningen avlyssnas.',
    );
  }
} catch (err) {
  app.log.error(err);
  close();
  process.exit(1);
}
