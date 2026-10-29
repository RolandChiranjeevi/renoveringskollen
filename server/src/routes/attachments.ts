import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import {
  attachmentFieldsSchema,
  attachmentListQuerySchema,
  attachmentUpdateSchema,
  idParamSchema,
} from '@reno/shared';
import { attachments, expenses } from '../db/schema.ts';
import { found, HttpError } from '../http/errors.ts';
import { parse } from '../http/validate.ts';
import { detectFileType } from '../storage/files.ts';
import type { RouteDeps } from './types.ts';

// Rubriken "filename*" klarar å, ä, ö; "filename" är en ASCII-reserv för äldre klienter.
function contentDisposition(type: 'inline' | 'attachment', name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const attachmentRoutes =
  ({ db, files }: RouteDeps): FastifyPluginAsync =>
  async (app) => {
    const getAttachment = (id: number) =>
      found(db.select().from(attachments).where(eq(attachments.id, id)).get(), 'Bilagan');

    app.get('/attachments', async (req) => {
      const { projectId, expenseId, roomId, quoteId, inbox } = parse(
        attachmentListQuerySchema,
        req.query,
      );
      if (!projectId && !expenseId && !roomId && !quoteId && !inbox) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Ange projectId, expenseId, roomId, quoteId eller inbox=1',
        );
      }
      const filters: SQL[] = [];
      if (inbox) {
        filters.push(
          eq(attachments.kind, 'kvitto'),
          isNull(attachments.projectId),
          isNull(attachments.expenseId),
          isNull(attachments.roomId),
        );
      }
      if (projectId) filters.push(eq(attachments.projectId, projectId));
      if (expenseId) filters.push(eq(attachments.expenseId, expenseId));
      if (roomId) filters.push(eq(attachments.roomId, roomId));
      if (quoteId) filters.push(eq(attachments.quoteId, quoteId));
      return db
        .select()
        .from(attachments)
        .where(and(...filters))
        .orderBy(desc(attachments.createdAt), desc(attachments.id))
        .all();
    });

    app.get('/attachments/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      return getAttachment(id);
    });

    // multipart/form-data: fälten kind + projectId/expenseId/roomId och en fil (valfri ordning).
    app.post('/attachments', async (req, reply) => {
      if (!req.isMultipart()) {
        throw new HttpError(
          415,
          'FST_INVALID_MULTIPART_CONTENT_TYPE',
          'Förväntade multipart/form-data',
        );
      }
      const fields: Record<string, string> = {};
      let upload: { buffer: Buffer; filename: string } | undefined;
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (upload) throw new HttpError(400, 'FST_FILES_LIMIT', 'Endast en fil per uppladdning');
          upload = { buffer: await part.toBuffer(), filename: part.filename };
        } else if (typeof part.value === 'string') {
          fields[part.fieldname] = part.value;
        }
      }
      const meta = parse(attachmentFieldsSchema, fields);
      if (!upload || upload.buffer.length === 0) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ingen fil bifogad');
      }
      const type = detectFileType(upload.buffer);
      if (!type) {
        throw new HttpError(
          415,
          'UNSUPPORTED_FILE_TYPE',
          'Filtypen stöds inte (JPEG, PNG, WebP, HEIC eller PDF)',
        );
      }

      const storedName = await files.save(upload.buffer, type.ext);
      try {
        const row = db
          .insert(attachments)
          .values({
            ...meta,
            originalName: upload.filename.slice(0, 255) || `fil.${type.ext}`,
            storedName,
            mimeType: type.mimeType,
            sizeBytes: upload.buffer.length,
          })
          .returning()
          .get();
        reply.status(201);
        return row;
      } catch (err) {
        await files.remove([storedName]);
        throw err;
      }
    });

    app.get('/attachments/:id/file', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const { download } = req.query as { download?: string };
      const attachment = getAttachment(id);
      const filePath = files.pathFor(attachment.storedName);
      if (!fs.existsSync(filePath)) throw new HttpError(404, 'NOT_FOUND', 'Filen saknas på disken');
      return reply
        .header('Content-Type', attachment.mimeType)
        .header('Content-Length', attachment.sizeBytes)
        .header(
          'Content-Disposition',
          contentDisposition(download ? 'attachment' : 'inline', attachment.originalName),
        )
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Security-Policy', "default-src 'none'")
        .header('Cache-Control', 'private, max-age=3600')
        .send(fs.createReadStream(filePath));
    });

    // Bildtext och typ (Före/Efter/Övrigt) kan ändras i efterhand; själva filen ligger kvar.
    app.patch('/attachments/:id', async (req) => {
      const { id } = parse(idParamSchema, req.params);
      const body = parse(attachmentUpdateSchema, req.body);
      const current = getAttachment(id);
      // Offertdokument behåller sin typ, och inget annat får bli ett offertdokument.
      if (body.kind !== undefined && (body.kind === 'offert') !== (current.quoteId != null)) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Ogiltiga uppgifter', [
          { path: 'kind', message: 'Typen kan inte ändras för offertdokument' },
        ]);
      }
      if (body.expenseId !== undefined) {
        // Bara ett kvitto i inkorgen kan kopplas till en utgift.
        const inInbox =
          current.kind === 'kvitto' && !current.projectId && !current.expenseId && !current.roomId;
        if (!inInbox) {
          throw new HttpError(
            409,
            'CONFLICT',
            'Bara kvitton i inkorgen kan kopplas till en utgift',
          );
        }
        found(db.select().from(expenses).where(eq(expenses.id, body.expenseId)).get(), 'Utgiften');
      }
      return db
        .update(attachments)
        .set({
          ...body,
          caption: body.caption === '' ? null : body.caption,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(attachments.id, id))
        .returning()
        .get();
    });

    app.delete('/attachments/:id', async (req, reply) => {
      const { id } = parse(idParamSchema, req.params);
      const removed = found(
        db.delete(attachments).where(eq(attachments.id, id)).returning().get(),
        'Bilagan',
      );
      await files.remove([removed.storedName]);
      reply.status(204);
    });
  };
