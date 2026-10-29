import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(serverRoot, '..');

export interface Config {
  host: string;
  port: number;
  databasePath: string;
  uploadsDir: string;
  /** Mappen säkerhetskopiorna sparas i (BACKUP_DIR). */
  backupDir: string;
  /** Sätt COOKIE_SECURE=true när appen nås via HTTPS (krävs utanför localhost). */
  cookieSecure: boolean;
  /** Sätt TRUST_PROXY=true bakom en omvänd proxy (Caddy, Tailscale Serve m.fl.). */
  trustProxy: boolean;
  /** Byggd webbapp som servern levererar om den finns (npm run build). */
  webDist: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3100);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Ogiltig PORT: ${env.PORT}`);
  }
  return {
    // Standard är endast lokalt. Sätt HOST=0.0.0.0 för att nå appen från andra enheter.
    host: env.HOST ?? '127.0.0.1',
    port,
    databasePath: path.resolve(projectRoot, env.DATABASE_PATH ?? 'data/renoveringskollen.db'),
    uploadsDir: path.resolve(projectRoot, env.UPLOADS_DIR ?? 'uploads'),
    backupDir: path.resolve(projectRoot, env.BACKUP_DIR ?? 'backups'),
    cookieSecure: env.COOKIE_SECURE === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    webDist: path.resolve(projectRoot, 'web/dist'),
  };
}

export const migrationsFolder = path.resolve(serverRoot, 'drizzle');
