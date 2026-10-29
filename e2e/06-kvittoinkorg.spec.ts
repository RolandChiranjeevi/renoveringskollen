import { expect, test } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Bygger på projektet "Ny altan" från 05-bilder.

// Ett 1×1 pixlar stort PNG, tillräckligt för att servern ska godkänna filen.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

test.describe.configure({ mode: 'serial' });

test('ett fotat kvitto väntar i inkorgen och blir en utgift med kvittot kopplat', async ({
  page,
}) => {
  await signInAsOwner(page);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const project = projects.find((p) => p.title === 'Ny altan');
  expect(project, 'projektet "Ny altan" från 05-bilder').toBeTruthy();

  await page.goto('/utgifter');
  const inbox = page.getByRole('region', { name: /Kvitton att bokföra/ });
  await expect(inbox.getByRole('button', { name: 'Fota kvitto' })).toBeVisible();

  // Kameraknappen på mobilen är en vanlig filinmatning med capture; här laddar vi upp via den.
  await expect(page.locator('input[capture="environment"]')).toHaveCount(1);
  await page
    .locator('input[capture="environment"]')
    .setInputFiles({ name: 'ica-kvitto.png', mimeType: 'image/png', buffer: PNG });
  await expect(inbox.getByRole('listitem', { name: /Kvitto ica-kvitto\.png/ })).toBeVisible();

  // Ännu ingen utgift: projektets utgifter är oförändrade.
  const before = await (await page.request.get(`/api/projects/${project!.id}/expenses`)).json();

  await inbox.getByRole('button', { name: 'Skapa utgift' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vilket projekt?').selectOption({ label: 'Ny altan' });
  await expect(dialog.getByAltText('Kvittot')).toBeVisible();
  await dialog.getByLabel('Vad köptes?').fill('Skruv och beslag');
  await dialog.getByLabel('Belopp (kr)').fill('249,50');
  // Kvittot finns redan, så det ska inte gå att bifoga ett till.
  await expect(dialog.getByText('Bifoga kvitto (valfritt)')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Spara' }).click();

  await expect(dialog).toBeHidden();
  await expect(inbox.getByRole('listitem')).toHaveCount(0);

  const after: { id: number; description: string; amountOre: number }[] = await (
    await page.request.get(`/api/projects/${project!.id}/expenses`)
  ).json();
  expect(after).toHaveLength(before.length + 1);
  const created = after.find((e) => e.description === 'Skruv och beslag')!;
  expect(created.amountOre).toBe(24_950);

  const receipts: { originalName: string }[] = await (
    await page.request.get(`/api/attachments?expenseId=${created.id}`)
  ).json();
  expect(receipts.map((r) => r.originalName)).toEqual(['ica-kvitto.png']);
});

test('ett kvitto i inkorgen kan tas bort', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/utgifter');
  await page
    .locator('input[capture="environment"]')
    .setInputFiles({ name: 'fel-kvitto.png', mimeType: 'image/png', buffer: PNG });
  const inbox = page.getByRole('region', { name: /Kvitton att bokföra/ });
  await expect(inbox.getByRole('listitem')).toHaveCount(1);

  page.on('dialog', (d) => d.accept());
  await inbox.getByRole('button', { name: /^Ta bort kvitto/ }).click();
  await expect(inbox.getByRole('listitem')).toHaveCount(0);
});
