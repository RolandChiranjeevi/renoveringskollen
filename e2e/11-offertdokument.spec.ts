import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Bygger på projektet "Fönsterbyte" och offerten från Snickeri Svensson i 08-offerter.

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\ntrailer\n<< >>\n%%EOF\n');

test.describe.configure({ mode: 'serial' });

let quoteId: number;

async function quoteDocs(page: Page): Promise<{ originalName: string }[]> {
  return (await page.request.get(`/api/attachments?quoteId=${quoteId}`)).json();
}

async function openCard(page: Page) {
  await signInAsOwner(page);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const project = projects.find((p) => p.title === 'Fönsterbyte');
  expect(project, 'projektet "Fönsterbyte" från 08-offerter').toBeTruthy();
  const quotes: { id: number; supplier: string }[] = await (
    await page.request.get(`/api/projects/${project!.id}/quotes`)
  ).json();
  quoteId = quotes.find((q) => q.supplier === 'Snickeri Svensson')!.id;
  await page.goto(`/projekt/${project!.id}?flik=offerter`);
  return page.getByRole('article', { name: /Snickeri Svensson/ });
}

test('offerten som PDF bifogas till kortet och går att öppna därifrån', async ({ page }) => {
  const card = await openCard(page);
  await card.locator('input[type="file"]').setInputFiles({
    name: 'offert-snickeri.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });

  const link = card.getByRole('link', { name: 'offert-snickeri.pdf' });
  await expect(link).toBeVisible();
  expect((await quoteDocs(page)).map((d) => d.originalName)).toEqual(['offert-snickeri.pdf']);

  // Länken öppnar själva filen.
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/api\/attachments\/\d+\/file$/);
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');

  // Och finns kvar efter omladdning.
  await page.reload();
  await expect(
    page
      .getByRole('article', { name: /Snickeri Svensson/ })
      .getByRole('link', { name: 'offert-snickeri.pdf' }),
  ).toBeVisible();
});

test('dokumentet går att ta bort med ångra, och tas bort när tiden gått ut', async ({ page }) => {
  // Ångra-fönstret på 8 sekunder styrs med klockan, så testet inte beror på hur snabb datorn är.
  await page.clock.install();
  const card = await openCard(page);
  await card.getByRole('button', { name: 'Ta bort dokumentet offert-snickeri.pdf' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Dokumentet ”offert-snickeri.pdf” togs bort',
  );
  await expect(card.getByRole('link', { name: 'offert-snickeri.pdf' })).toHaveCount(0);
  expect(await quoteDocs(page)).toHaveLength(1);

  await page.getByRole('button', { name: 'Ångra' }).click();
  await expect(card.getByRole('link', { name: 'offert-snickeri.pdf' })).toBeVisible();

  await card.getByRole('button', { name: 'Ta bort dokumentet offert-snickeri.pdf' }).click();
  await page.clock.fastForward(9_000);
  await expect.poll(async () => (await quoteDocs(page)).length, { timeout: 45_000 }).toBe(0);
  await expect(card.getByRole('link', { name: 'offert-snickeri.pdf' })).toHaveCount(0);
});
