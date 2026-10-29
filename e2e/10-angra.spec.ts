import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Bygger på projektet "Ny altan" från 05-bilder.

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

let projectId: number;
let expenseId: number;

async function expenseExists(page: Page) {
  const list: { id: number }[] = await (
    await page.request.get(`/api/projects/${projectId}/expenses`)
  ).json();
  return list.some((e) => e.id === expenseId);
}

async function createExpense(page: Page, date: string) {
  const res = await page.request.post(`/api/projects/${projectId}/expenses`, {
    data: { date, description: 'Skruv och lim', category: 'material', amountOre: 9_900 },
    headers: CSRF,
  });
  return (await res.json()).id as number;
}

async function deleteExpenseInUi(page: Page) {
  await page.getByRole('button', { name: /Skruv och lim/ }).click();
  await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
}

test('en borttagning går att ångra, och då har ingenting hänt på servern', async ({ page }) => {
  // Ångra-fönstret på 8 sekunder styrs med klockan, så testet inte beror på hur snabb datorn är.
  await page.clock.install();
  await signInAsOwner(page);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  projectId = projects.find((p) => p.title === 'Ny altan')!.id;
  expenseId = await createExpense(page, '2026-05-01');

  await page.goto(`/projekt/${projectId}?flik=utgifter`);
  await deleteExpenseInUi(page);

  // Ingen webbläsardialog: posten döljs och ett meddelande med Ångra visas.
  const toast = page.getByRole('status');
  await expect(toast).toContainText('Utgiften ”Skruv och lim” togs bort');
  await expect(page.getByRole('button', { name: /Skruv och lim/ })).toHaveCount(0);
  expect(await expenseExists(page)).toBe(true);

  await toast.getByRole('button', { name: 'Ångra' }).click();
  await expect(page.getByRole('button', { name: /Skruv och lim/ })).toBeVisible();
  await expect(toast).not.toContainText('togs bort');

  // Efter att tiden gått ut finns den kvar, eftersom borttagningen ångrades.
  await page.clock.fastForward(9_000);
  await page.waitForTimeout(1_000); // ger en eventuell borttagning tid att nå servern
  expect(await expenseExists(page)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /Skruv och lim/ })).toBeVisible();
});

test('en borttagning som inte ångras tas bort på servern när tiden gått ut', async ({ page }) => {
  // Ångra-fönstret på 8 sekunder styrs med klockan, så testet inte beror på hur snabb datorn är.
  await page.clock.install();
  await signInAsOwner(page);
  await page.goto(`/projekt/${projectId}?flik=utgifter`);
  await deleteExpenseInUi(page);
  await expect(page.getByRole('status')).toContainText('togs bort');

  expect(await expenseExists(page)).toBe(true);
  await page.clock.fastForward(9_000);
  await expect.poll(() => expenseExists(page), { timeout: 20_000 }).toBe(false);
  await expect(page.getByRole('status')).not.toContainText('togs bort');
  await expect(page.getByText('Skruv och lim')).toHaveCount(0);
});

test('laddar man om sidan direkt blir borttagningen av det man tog bort ändå av', async ({
  page,
}) => {
  await signInAsOwner(page);
  expenseId = await createExpense(page, '2026-05-02');
  await page.goto(`/projekt/${projectId}?flik=utgifter`);
  await deleteExpenseInUi(page);
  await expect(page.getByRole('status')).toContainText('togs bort');

  await page.reload();
  await expect.poll(() => expenseExists(page), { timeout: 5_000 }).toBe(false);
});

test('uppgifter har samma ångra-möjlighet', async ({ page }) => {
  await signInAsOwner(page);
  await page.request.post(`/api/projects/${projectId}/tasks`, {
    data: { title: 'Impregnera' },
    headers: CSRF,
  });
  await page.goto(`/projekt/${projectId}?flik=uppgifter`);
  await page.getByRole('button', { name: 'Ta bort Impregnera' }).click();
  await expect(page.getByRole('status')).toContainText('Uppgiften ”Impregnera” togs bort');
  await expect(page.getByText('Impregnera', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ångra' }).click();
  await expect(page.getByText('Impregnera', { exact: true })).toBeVisible();
});
