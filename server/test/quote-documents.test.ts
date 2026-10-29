import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, multipartBody, PDF_BYTES, PNG_BYTES, type TestCtx } from './helpers.ts';

describe('dokument på offerter', () => {
  let ctx: TestCtx;
  let projectId: number;
  let quoteId: number;

  const upload = (fields: Record<string, string>, file?: Parameters<typeof multipartBody>[1]) =>
    ctx.app.inject({ method: 'POST', url: '/api/attachments', ...multipartBody(fields, file) });
  const attachQuoteDoc = (id = quoteId, name = 'offert.pdf') =>
    upload(
      { kind: 'offert', quoteId: String(id) },
      { name, content: PDF_BYTES, type: 'application/pdf' },
    );
  const filesOnDisk = () => fs.readdirSync(ctx.uploadsDir);
  const list = async (query: string) =>
    (await ctx.app.inject({ method: 'GET', url: `/api/attachments?${query}` })).json();

  beforeEach(async () => {
    ctx = createTestApp();
    projectId = (
      await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'Badrum' } })
    ).json().id;
    quoteId = (
      await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/quotes`,
        payload: { supplierName: 'Bygg AB', amountOre: 5_000_000 },
      })
    ).json().id;
  });
  afterEach(() => ctx.close());

  it('bifogar en PDF och ett foto till offerten och listar dem på offerten', async () => {
    const pdf = await attachQuoteDoc();
    expect(pdf.statusCode).toBe(201);
    expect(pdf.json()).toMatchObject({
      kind: 'offert',
      quoteId,
      projectId: null,
      expenseId: null,
      roomId: null,
      mimeType: 'application/pdf',
      originalName: 'offert.pdf',
    });
    const photo = await upload(
      { kind: 'offert', quoteId: String(quoteId) },
      { name: 'foto.png', content: PNG_BYTES, type: 'image/png' },
    );
    expect(photo.statusCode).toBe(201);

    const docs = await list(`quoteId=${quoteId}`);
    expect(docs.map((d: { originalName: string }) => d.originalName).sort()).toEqual([
      'foto.png',
      'offert.pdf',
    ]);
  });

  it('hamnar inte bland projektets bilder, kvitton eller kvittoinkorgen', async () => {
    await attachQuoteDoc();
    expect(await list(`projectId=${projectId}`)).toEqual([]);
    expect(await list('inbox=1')).toEqual([]);
    expect(await list('quoteId=999')).toEqual([]);
  });

  it('serverar filen som vanligt', async () => {
    const doc = (await attachQuoteDoc()).json();
    const file = await ctx.app.inject({ method: 'GET', url: `/api/attachments/${doc.id}/file` });
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
  });

  it('kräver att typen offert och offerten hör ihop', async () => {
    const noQuote = await upload(
      { kind: 'offert', projectId: String(projectId) },
      { name: 'a.pdf', content: PDF_BYTES },
    );
    expect(noQuote.statusCode).toBe(400);
    const wrongKind = await upload(
      { kind: 'fore', quoteId: String(quoteId) },
      { name: 'a.png', content: PNG_BYTES },
    );
    expect(wrongKind.statusCode).toBe(400);
    expect(filesOnDisk()).toEqual([]);
  });

  it('nekar dokument på en offert som inte finns och lämnar ingen fil efter sig', async () => {
    const res = await attachQuoteDoc(999);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect(filesOnDisk()).toEqual([]);
  });

  it('typen på ett offertdokument kan inte ändras, och inget annat kan bli ett', async () => {
    const doc = (await attachQuoteDoc()).json();
    const photo = (
      await upload(
        { kind: 'fore', projectId: String(projectId) },
        { name: 'a.png', content: PNG_BYTES },
      )
    ).json();
    const patch = (id: number, payload: object) =>
      ctx.app.inject({ method: 'PATCH', url: `/api/attachments/${id}`, payload });

    expect((await patch(doc.id, { kind: 'ovrigt' })).statusCode).toBe(400);
    expect((await patch(photo.id, { kind: 'offert' })).statusCode).toBe(400);
    // Bildtext går bra, och vanliga bilder kan byta mellan Före/Efter som förut.
    expect((await patch(doc.id, { caption: 'Pris inkl. moms' })).json().caption).toBe(
      'Pris inkl. moms',
    );
    expect((await patch(photo.id, { kind: 'efter' })).statusCode).toBe(200);
  });

  it('tar bort dokumentens filer när offerten tas bort', async () => {
    await attachQuoteDoc();
    await attachQuoteDoc(quoteId, 'bilaga.pdf');
    expect(filesOnDisk()).toHaveLength(2);

    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/quotes/${quoteId}` });
    expect(del.statusCode).toBe(204);
    expect(filesOnDisk()).toEqual([]);
    expect(await list(`quoteId=${quoteId}`)).toEqual([]);
  });

  it('tar bort dokumentens filer när projektet tas bort', async () => {
    await attachQuoteDoc();
    // Ett dokument på en offert i ett annat projekt ska inte röras.
    await upload(
      { kind: 'fore', projectId: String(projectId) },
      { name: 'a.png', content: PNG_BYTES },
    );
    const other = (
      await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'Kök' } })
    ).json();
    const otherQuote = (
      await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${other.id}/quotes`,
        payload: { supplierName: 'Annan', amountOre: 1 },
      })
    ).json();
    const kept = (await attachQuoteDoc(otherQuote.id, 'kvar.pdf')).json();
    expect(filesOnDisk()).toHaveLength(3);

    await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${projectId}` });
    expect(filesOnDisk()).toEqual([kept.storedName]);
  });

  it('kan tas bort ett i taget utan att offerten påverkas', async () => {
    const doc = (await attachQuoteDoc()).json();
    expect(
      (await ctx.app.inject({ method: 'DELETE', url: `/api/attachments/${doc.id}` })).statusCode,
    ).toBe(204);
    expect(filesOnDisk()).toEqual([]);
    const quotes = (
      await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/quotes` })
    ).json();
    expect(quotes).toHaveLength(1);
  });
});
