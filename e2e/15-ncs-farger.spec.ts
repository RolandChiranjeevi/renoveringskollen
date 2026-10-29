import { expect, test, type Locator } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

let roomId: number;

test.beforeAll(async ({ browser }) => {
  // Egen testdata, så att specen inte beror på vad tidigare specar lämnat efter sig.
  const page = await browser.newPage();
  await signInAsOwner(page);
  const post = async (url: string, data: object) =>
    (await (await page.request.post(url, { data, headers: CSRF })).json()) as { id: number };
  roomId = (await post('/api/rooms', { name: 'NCS-rummet' })).id;
  const paint = (name: string, colorCode: string, colorHex?: string) =>
    post(`/api/rooms/${roomId}/materials`, {
      surface: 'vagg',
      type: 'farg',
      name,
      colorCode,
      ...(colorHex ? { colorHex } : {}),
    });
  await paint('Grå vägg', 'NCS S 1500-N');
  await paint('Vald färg', 'NCS S 0502-Y', '#112233');
  await paint('Annat system', 'RAL 9010');
  // Försäljningsunderlaget visar bara sina avsnitt när det finns minst ett projekt.
  const project = await post('/api/projects', { title: 'NCS-projekt', roomIds: [roomId] });
  await post(`/api/projects/${project.id}/expenses`, {
    date: '2026-05-01',
    description: 'Färg',
    category: 'material',
    amountOre: 50_000,
  });
  await page.close();
});

const background = (el: Locator) => el.evaluate((node) => getComputedStyle(node).backgroundColor);

test('en NCS-kod utan färgruta får en ungefärlig färgruta, märkt som ungefärlig', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`/rum/${roomId}`);

  const approx = page.getByRole('img', { name: 'Ungefärligt färgprov NCS S 1500-N' });
  await expect(approx).toBeVisible();
  expect(await background(approx)).toBe('rgb(217, 217, 217)');
  await expect(approx).toHaveAttribute('title', /Ungefärlig färg beräknad från NCS-koden/);
});

test('en angiven färgruta gäller alltid, även när koden är en NCS-kod', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/rum/${roomId}`);

  const exact = page.getByRole('img', { name: 'Färgprov NCS S 0502-Y', exact: true });
  await expect(exact).toBeVisible();
  expect(await background(exact)).toBe('rgb(17, 34, 51)');
  await expect(page.getByRole('img', { name: /Ungefärligt färgprov NCS S 0502-Y/ })).toHaveCount(0);
});

test('en kod från ett annat system (RAL) får ingen påhittad färgruta', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/rum/${roomId}`);
  await expect(page.getByText('Annat system')).toBeVisible();
  await expect(page.getByRole('img', { name: /färgprov RAL 9010/i })).toHaveCount(0);
});

test('i formuläret föreslås färgen medan man skriver, och kan användas som färgruta', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`/rum/${roomId}`);
  await page.getByRole('button', { name: 'Lägg till material' }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Vad för färg?').fill('Nytt tak');
  await dialog.getByLabel('Kulörkod').fill('NCS S 0502-Y');
  await expect(dialog.getByText('Ungefärlig färg från NCS-koden (#F2F1ED)')).toBeVisible();

  await dialog.getByRole('button', { name: 'Använd som färgruta' }).click();
  await expect(dialog.getByLabel('Färgruta (hex)')).toHaveValue('#F2F1ED');
  // Nu är färgen vald, så förslaget ersätts av den vanliga raden.
  await expect(dialog.getByRole('button', { name: 'Använd som färgruta' })).toHaveCount(0);
  await expect(dialog.getByText('Ungefärlig färg på skärm – kulörkoden gäller.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('img', { name: 'Färgprov NCS S 0502-Y', exact: true })).toHaveCount(
    2,
  );
});

test('inget förslag för koder som inte är NCS', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(`/rum/${roomId}`);
  await page.getByRole('button', { name: 'Lägg till material' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vad för färg?').fill('Annan färg');
  await dialog.getByLabel('Kulörkod').fill('RAL 9010');
  await expect(dialog.getByText(/Ungefärlig färg från NCS-koden/)).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Använd som färgruta' })).toHaveCount(0);
});

test('försäljningsunderlaget visar den ungefärliga färgen intill materialet', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/forsaljning');
  await expect(page.getByRole('heading', { name: 'Husets renoveringshistorik' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Ungefärligt färgprov NCS S 1500-N' })).toBeVisible();
});
