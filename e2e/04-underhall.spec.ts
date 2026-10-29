import { expect, test } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

/** Datum ÅÅÅÅ-MM-DD som ligger `days` dagar från idag (lokal tid, som webbläsaren och servern). */
function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test.describe.configure({ mode: 'serial' });

test('ett försenat jobb syns under Försenat och i Kommande', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/underhall');
  await expect(page.getByText('Inga underhållsjobb ännu')).toBeVisible();

  await page.getByRole('button', { name: 'Nytt jobb' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Vad ska göras?').fill('Olja altanen');
  await dialog.getByLabel('Hur ofta?').selectOption('12');
  await dialog.getByLabel('Första gången ska det göras').fill(isoIn(-10));
  await dialog.getByRole('button', { name: 'Spara' }).click();

  const overdue = page.getByRole('region', { name: /Försenat/ });
  await expect(overdue).toContainText('Olja altanen');
  await expect(overdue).toContainText('10 dagar försenad');
  await expect(overdue).toContainText('Hela huset');
  await expect(overdue).toContainText('varje år');
  await expect(overdue).toContainText('aldrig gjort');

  await page.goto('/');
  const card = page.getByRole('heading', { name: 'Kommande', exact: true }).locator('..');
  await expect(card).toContainText('Olja altanen');
  await expect(card).toContainText('10 dagar försenad');
});

test('att markera som gjord flyttar nästa gång ett intervall framåt', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/underhall');
  await page.getByRole('button', { name: 'Markera Olja altanen som gjord' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Anteckning (valfritt)').fill('Två strykningar');
  await dialog.getByRole('button', { name: 'Markera som gjord' }).click();

  await expect(page.getByRole('region', { name: /Försenat/ })).toHaveCount(0);
  const later = page.getByRole('region', { name: /Senare/ });
  await expect(later).toContainText('Olja altanen');
  await expect(later).toContainText('Historik (1)');

  await page.goto('/');
  await expect(page.getByText('Olja altanen')).toHaveCount(0);
});

test('att ta bort en historikpost gör jobbet försenat igen', async ({ page }) => {
  // Ångra-fönstret på 8 sekunder styrs med klockan, så testet inte beror på hur snabb datorn är.
  await page.clock.install();
  await signInAsOwner(page);
  await page.goto('/underhall');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /^Historik/ }).click();
  await expect(page.getByText('Två strykningar')).toBeVisible();
  await page.getByRole('button', { name: /^Ta bort posten/ }).click();
  await expect(page.getByText('Två strykningar')).toHaveCount(0);
  await page.clock.fastForward(9_000);

  // Borttagningen går att ångra i några sekunder; först sedan räknas jobbet om som försenat.
  await expect(page.getByRole('region', { name: /Försenat/ })).toContainText('Olja altanen', {
    timeout: 20_000,
  });
});

test('ett jobb kan redigeras och tas bort', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/underhall');
  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Redigera Olja altanen' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Hur ofta?').selectOption('6');
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(page.getByText(/var 6:e månad/)).toBeVisible();

  await page.getByRole('button', { name: 'Ta bort Olja altanen' }).click();
  await expect(page.getByText('Inga underhållsjobb ännu')).toBeVisible();
});
