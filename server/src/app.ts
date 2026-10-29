import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { sql } from 'drizzle-orm';
import { CSRF_HEADER } from '@reno/shared';
import type { CookieSettings } from './auth/cookies.ts';
import { FailureLimiter } from './auth/rateLimit.ts';
import { makeRequireUser } from './auth/requireUser.ts';
import type { Db } from './db/client.ts';
import { errorHandler, HttpError, type ApiError } from './http/errors.ts';
import type { BackupService } from './backup/backupService.ts';
import { attachmentRoutes } from './routes/attachments.ts';
import { backupRoutes } from './routes/backups.ts';
import { budgetRoutes } from './routes/budgets.ts';
import { accountRoutes, publicAuthRoutes, type AuthDeps } from './routes/auth.ts';
import { contractorRoutes } from './routes/contractors.ts';
import { expenseRoutes } from './routes/expenses.ts';
import { maintenanceRoutes } from './routes/maintenance.ts';
import { quoteRoutes } from './routes/quotes.ts';
import { materialRoutes } from './routes/materials.ts';
import { noteRoutes } from './routes/notes.ts';
import { projectRoutes } from './routes/projects.ts';
import { reportRoutes } from './routes/report.ts';
import { roomRoutes } from './routes/rooms.ts';
import { saleReportRoutes } from './routes/saleReport.ts';
import { globalSearchRoutes } from './routes/globalSearch.ts';
import { searchRoutes } from './routes/search.ts';
import { statsRoutes } from './routes/stats.ts';
import { taskRoutes } from './routes/tasks.ts';
import { upcomingRoutes } from './routes/upcoming.ts';
import { FileStore, MAX_UPLOAD_BYTES } from './storage/files.ts';

export type { ApiError };

export interface AppDeps {
  db: Db;
  files: FileStore;
  /** Säkerhetskopior från appen (knappen under Konto). Utelämnas om de inte ska gå att skapa där. */
  backups?: BackupService;
  cookies?: CookieSettings;
  /** Byggd webbapp att leverera (web/dist). Utelämnas i tester och i utvecklingsläge. */
  webDist?: string;
  /** Tillåt första start (skapa ägarkonto) från andra datorer än servern själv. */
  allowRemoteSetup?: boolean;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// CSP för webbappen. style-src 'unsafe-inline' behövs för stilattribut (stapelbredder m.m.).
const HTML_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function buildApp(deps: AppDeps, opts: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(opts);
  const cookies = deps.cookies ?? { secure: false };
  const authDeps: AuthDeps = {
    ...deps,
    cookies,
    limiters: {
      byIp: new FailureLimiter(20, 15 * 60 * 1000),
      byEmail: new FailureLimiter(5, 15 * 60 * 1000),
    },
  };

  app.decorateRequest('user');
  app.decorateRequest('sessionId', '');
  app.setErrorHandler(errorHandler);

  app.register(cookie);
  app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10, fieldSize: 1024 },
    throwFileSizeLimit: true,
  });

  // Säkerhetsrubriker på alla svar. Bilagor sätter sin egen, striktare CSP.
  // CSP väljs efter sökväg, inte innehållstyp: ett 304-svar (sidan oförändrad i webbläsarens
  // cache) saknar Content-Type, och fick då API:ts strikta policy – som blockerade appens skript.
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    if (!reply.hasHeader('Content-Security-Policy')) {
      const isApi = req.url === '/api' || req.url.startsWith('/api/');
      reply.header('Content-Security-Policy', isApi ? "default-src 'none'" : HTML_CSP);
    }
  });

  app.register(
    async (api) => {
      // CSRF: webbläsare kan inte skicka egna rubriker till andra sajter utan CORS, som vi inte tillåter.
      api.addHook('onRequest', async (req) => {
        if (!SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== '1') {
          throw new HttpError(403, 'CSRF', 'Förfrågan saknar skyddsrubrik');
        }
      });

      api.get('/health', async () => {
        deps.db.get(sql`select 1`);
        return { status: 'ok' };
      });

      if (!deps.allowRemoteSetup) {
        api.addHook('onRequest', async (req) => {
          // Jämför matchad route, inte req.url – den innehåller frågesträngen (?x=1).
          const route = req.routeOptions.url;
          if (req.method === 'POST' && route === '/api/auth/setup' && !LOOPBACK.has(req.ip)) {
            throw new HttpError(
              403,
              'SETUP_LOCAL_ONLY',
              'Första start måste göras på datorn där appen körs (http://localhost)',
            );
          }
        });
      }
      api.register(publicAuthRoutes(authDeps));

      // Allt annat kräver inloggning.
      api.register(async (protectedApi) => {
        protectedApi.addHook('onRequest', makeRequireUser(deps.db, cookies));
        protectedApi.register(accountRoutes(authDeps));
        for (const routes of [
          roomRoutes,
          contractorRoutes,
          projectRoutes,
          expenseRoutes,
          taskRoutes,
          noteRoutes,
          attachmentRoutes,
          searchRoutes,
          globalSearchRoutes,
          statsRoutes,
          reportRoutes,
          materialRoutes,
          maintenanceRoutes,
          quoteRoutes,
          backupRoutes,
          saleReportRoutes,
          budgetRoutes,
          upcomingRoutes,
        ]) {
          protectedApi.register(routes(deps));
        }
      });
    },
    { prefix: '/api' },
  );

  const serveWeb = !!deps.webDist && fs.existsSync(path.join(deps.webDist, 'index.html'));
  if (serveWeb) {
    app.register(fastifyStatic, {
      root: deps.webDist!,
      wildcard: false,
      // Filer under assets/ har innehållshash i namnet och kan cachas länge.
      setHeaders: (res, filePath) => {
        res.header(
          'Cache-Control',
          filePath.includes(`${path.sep}assets${path.sep}`)
            ? 'public, max-age=31536000, immutable'
            : 'no-cache',
        );
      },
    });
  }

  app.setNotFoundHandler((req, reply) => {
    // Webbappens egna sidor (t.ex. /projekt/3) hanteras av klienten.
    if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    }
    const body: ApiError = { error: { code: 'NOT_FOUND', message: 'Hittades inte' } };
    reply.status(404).send(body);
  });

  return app;
}
