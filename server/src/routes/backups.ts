import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireOwner } from '../auth/requireUser.ts';
import { BackupBusyError, type BackupService } from '../backup/backupService.ts';
import { HttpError } from '../http/errors.ts';
import { parse } from '../http/validate.ts';

const nameParamSchema = z.object({ name: z.string().max(100) });

/**
 * Säkerhetskopior från appen. Bara ägaren: en kopia innehåller allt, även andras kontouppgifter
 * (lösenord finns bara som hash) och alla kvitton.
 */
export const backupRoutes =
  ({ backups }: { backups?: BackupService }): FastifyPluginAsync =>
  async (app) => {
    app.addHook('onRequest', requireOwner);

    const service = () => {
      if (!backups) {
        throw new HttpError(501, 'NOT_IMPLEMENTED', 'Säkerhetskopiering är inte påslagen');
      }
      return backups;
    };

    app.get('/backups', async () => service().list());

    app.post('/backups', async (_req, reply) => {
      try {
        const result = await service().create();
        reply.status(201);
        return result;
      } catch (err) {
        if (err instanceof BackupBusyError) throw new HttpError(409, 'CONFLICT', err.message);
        throw err;
      }
    });

    app.get('/backups/:name/download', async (req, reply) => {
      const { name } = parse(nameParamSchema, req.params);
      const file = await service().pathFor(name);
      if (!file) throw new HttpError(404, 'NOT_FOUND', 'Säkerhetskopian finns inte');
      const { size } = await stat(file);
      return reply
        .header('Content-Type', 'application/gzip')
        .header('Content-Length', size)
        .header('Content-Disposition', `attachment; filename="${name}"`)
        .header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'no-store')
        .send(createReadStream(file));
    });
  };
