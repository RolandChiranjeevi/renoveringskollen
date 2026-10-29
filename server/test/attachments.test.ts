import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, multipartBody, PDF_BYTES, PNG_BYTES, type TestCtx } from './helpers.ts';

describe('bilagor', () => {
  let ctx: TestCtx;
  let projectId: number;
  let expenseId: number;

  const upload = (fields: Record<string, string>, file?: Parameters<typeof multipartBody>[1]) =>
    ctx.app.inject({ method: 'POST', url: '/api/attachments', ...multipartBody(fields, file) });
  const filesOnDisk = () => fs.readdirSync(ctx.uploadsDir);

  beforeEach(async () => {
    ctx = createTestApp();
    projectId = (
      await ctx.app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'Kök' } })
    ).json().id;
    expenseId = (
      await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/expenses`,
        payload: {
          date: '2026-10-01',
          description: 'Bänkskiva',
          category: 'material',
          amountOre: 100,
        },
      })
    ).json().id;
  });
  afterEach(() => ctx.close());

  it('laddar upp ett kvitto och serverar filen säkert', async () => {
    const res = await upload(
      { kind: 'kvitto', expenseId: String(expenseId) },
      { name: 'kvitto-bänkskiva.pdf', content: PDF_BYTES, type: 'application/pdf' },
    );
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a).toMatchObject({
      kind: 'kvitto',
      expenseId,
      originalName: 'kvitto-bänkskiva.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_BYTES.length,
    });
    expect(a.storedName).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(filesOnDisk()).toEqual([a.storedName]);

    const file = await ctx.app.inject({ method: 'GET', url: `/api/attachments/${a.id}/file` });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.equals(PDF_BYTES)).toBe(true);
    expect(file.headers['content-type']).toBe('application/pdf');
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['content-disposition']).toContain(
      "filename*=UTF-8''kvitto-b%C3%A4nkskiva.pdf",
    );

    const listed = (
      await ctx.app.inject({ method: 'GET', url: `/api/attachments?expenseId=${expenseId}` })
    ).json();
    expect(listed).toHaveLength(1);

    // En utgift till, utan kvitto – räkningen ska gälla rätt utgift.
    await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/expenses`,
      payload: { date: '2026-10-02', description: 'Skruv', category: 'material', amountOre: 50 },
    });
    const expenseList = (
      await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/expenses` })
    ).json() as { description: string; attachmentCount: number }[];
    expect(Object.fromEntries(expenseList.map((e) => [e.description, e.attachmentCount]))).toEqual({
      Bänkskiva: 1,
      Skruv: 0,
    });
  });

  it('avgör filtyp från innehållet, inte från filnamn eller Content-Type', async () => {
    const fake = await upload(
      { kind: 'fore', projectId: String(projectId) },
      { name: 'bild.png', content: Buffer.from('<script>alert(1)</script>'), type: 'image/png' },
    );
    expect(fake.statusCode).toBe(415);
    expect(fake.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const real = await upload(
      { kind: 'fore', projectId: String(projectId) },
      { name: 'foto', content: PNG_BYTES, type: 'application/octet-stream' },
    );
    expect(real.json().mimeType).toBe('image/png');
    expect(filesOnDisk()).toHaveLength(1);
  });

  it('nekar uppladdning utan ägare, utan fil eller med okänd ägare', async () => {
    const file = { name: 'a.png', content: PNG_BYTES };
    expect((await upload({ kind: 'efter' }, file)).statusCode).toBe(400);
    expect((await upload({ kind: 'efter', projectId: String(projectId) })).statusCode).toBe(400);
    const orphan = await upload({ kind: 'efter', projectId: '999' }, file);
    expect(orphan.statusCode).toBe(400);
    expect(orphan.json().error.code).toBe('INVALID_REFERENCE');
    expect(filesOnDisk()).toEqual([]);
  });

  it('nekar filer över 10 MB', async () => {
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(10 * 1024 * 1024)]);
    const res = await upload(
      { kind: 'fore', projectId: String(projectId) },
      { name: 'stor.png', content: big },
    );
    expect(res.statusCode).toBe(413);
    expect(res.json().error.message).toBe('Filen är för stor (max 10 MB)');
    expect(filesOnDisk()).toEqual([]);
  });

  it('tar bort filen från disken när bilagan raderas', async () => {
    const a = (
      await upload(
        { kind: 'fore', projectId: String(projectId) },
        { name: 'a.png', content: PNG_BYTES },
      )
    ).json();
    expect(
      (await ctx.app.inject({ method: 'DELETE', url: `/api/attachments/${a.id}` })).statusCode,
    ).toBe(204);
    expect(filesOnDisk()).toEqual([]);
  });

  it('tar bort filer på disken när projektet raderas, även utgifternas kvitton', async () => {
    await upload(
      { kind: 'fore', projectId: String(projectId) },
      { name: 'a.png', content: PNG_BYTES },
    );
    await upload(
      { kind: 'kvitto', expenseId: String(expenseId) },
      { name: 'k.pdf', content: PDF_BYTES },
    );
    expect(filesOnDisk()).toHaveLength(2);
    await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${projectId}` });
    expect(filesOnDisk()).toEqual([]);
  });

  describe('bildtext och typ', () => {
    const patch = (id: number, payload: object) =>
      ctx.app.inject({ method: 'PATCH', url: `/api/attachments/${id}`, payload });
    const photo = async () =>
      (
        await upload(
          { kind: 'fore', projectId: String(projectId) },
          { name: 'a.png', content: PNG_BYTES },
        )
      ).json();

    it('saknar bildtext från början och kan få en, som trimmas och går att ta bort', async () => {
      const a = await photo();
      expect(a.caption).toBeNull();

      const set = await patch(a.id, { caption: '  Väggen mot trädgården  ' });
      expect(set.statusCode).toBe(200);
      expect(set.json()).toMatchObject({
        id: a.id,
        caption: 'Väggen mot trädgården',
        kind: 'fore',
      });

      const cleared = await patch(a.id, { caption: '' });
      expect(cleared.json().caption).toBeNull();
      const nulled = await patch(a.id, { caption: null });
      expect(nulled.json().caption).toBeNull();
    });

    it('kan flytta en bild mellan Före, Efter och Övrigt utan att röra filen', async () => {
      const a = await photo();
      const moved = await patch(a.id, { kind: 'efter' });
      expect(moved.json()).toMatchObject({ kind: 'efter', storedName: a.storedName });
      expect((await patch(a.id, { kind: 'fel' })).statusCode).toBe(400);
      expect(filesOnDisk()).toEqual([a.storedName]);
    });

    it('nekar tom ändring, för lång text och okänd bild', async () => {
      const a = await photo();
      expect((await patch(a.id, {})).statusCode).toBe(400);
      expect((await patch(a.id, { caption: 'x'.repeat(301) })).statusCode).toBe(400);
      expect((await patch(999, { caption: 'Hej' })).statusCode).toBe(404);
    });

    it('kräver inloggning', async () => {
      const anon = createTestApp({ authenticated: false });
      const res = await anon.app.inject({
        method: 'PATCH',
        url: '/api/attachments/1',
        headers: { 'x-renoveringskollen': '1' },
        payload: { caption: 'x' },
      });
      expect(res.statusCode).toBe(401);
      await anon.close();
    });
  });

  describe('kvittoinkorg', () => {
    const inbox = async () =>
      (await ctx.app.inject({ method: 'GET', url: '/api/attachments?inbox=1' })).json();
    const receipt = async () =>
      (await upload({ kind: 'kvitto' }, { name: 'kvitto.png', content: PNG_BYTES })).json();

    it('tar emot ett kvitto utan ägare, och bara kvitton', async () => {
      const res = await upload({ kind: 'kvitto' }, { name: 'k.png', content: PNG_BYTES });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        kind: 'kvitto',
        projectId: null,
        expenseId: null,
        roomId: null,
      });
      expect(await inbox()).toHaveLength(1);

      // Andra typer måste fortfarande höra till något.
      const other = await upload({ kind: 'fore' }, { name: 'a.png', content: PNG_BYTES });
      expect(other.statusCode).toBe(400);
      expect(filesOnDisk()).toHaveLength(1);
    });

    it('visar bara kvitton som saknar ägare, nyast först', async () => {
      const first = await receipt();
      const second = await receipt();
      await upload(
        { kind: 'kvitto', expenseId: String(expenseId) },
        { name: 'k.pdf', content: PDF_BYTES },
      );
      await upload(
        { kind: 'fore', projectId: String(projectId) },
        { name: 'a.png', content: PNG_BYTES },
      );
      const list = await inbox();
      expect(list.map((a: { id: number }) => a.id)).toEqual([second.id, first.id]);
    });

    it('kopplar kvittot till en utgift, och då lämnar det inkorgen', async () => {
      const a = await receipt();
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/attachments/${a.id}`,
        payload: { expenseId },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: a.id, expenseId });
      expect(await inbox()).toEqual([]);
      const onExpense = await ctx.app.inject({
        method: 'GET',
        url: `/api/attachments?expenseId=${expenseId}`,
      });
      expect(onExpense.json().map((x: { id: number }) => x.id)).toEqual([a.id]);
    });

    it('nekar koppling till okänd utgift och koppling av bilagor som redan har en ägare', async () => {
      const a = await receipt();
      const missing = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/attachments/${a.id}`,
        payload: { expenseId: 999 },
      });
      expect(missing.statusCode).toBe(404);
      expect(await inbox()).toHaveLength(1);

      const owned = (
        await upload(
          { kind: 'kvitto', expenseId: String(expenseId) },
          { name: 'k.pdf', content: PDF_BYTES },
        )
      ).json();
      const moved = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/attachments/${owned.id}`,
        payload: { expenseId },
      });
      expect(moved.statusCode).toBe(409);
    });

    it('listan utan filter kräver fortfarande ett filter', async () => {
      const res = await ctx.app.inject({ method: 'GET', url: '/api/attachments' });
      expect(res.statusCode).toBe(400);
    });

    it('tas bort med filen från disken', async () => {
      const a = await receipt();
      expect(
        (await ctx.app.inject({ method: 'DELETE', url: `/api/attachments/${a.id}` })).statusCode,
      ).toBe(204);
      expect(filesOnDisk()).toEqual([]);
      expect(await inbox()).toEqual([]);
    });
  });
});
