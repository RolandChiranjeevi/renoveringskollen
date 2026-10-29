import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

const DARK_CANVAS = 'rgb(23, 21, 19)';
const LIGHT_CANVAS = 'rgb(246, 244, 240)';

const theme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);
const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe.configure({ mode: 'serial' });

test('följer enhetens ljust/mörkt som standard, utan att vänta på React', async ({ page }) => {
  await signInAsOwner(page);

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Översikt' })).toBeVisible();
  expect(await theme(page)).toBe('dark');
  expect(await canvas(page)).toBe(DARK_CANVAS);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Översikt' })).toBeVisible();
  expect(await theme(page)).toBe('light');
  expect(await canvas(page)).toBe(LIGHT_CANVAS);

  // Ändras enhetens inställning medan appen är öppen följer den med.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => theme(page)).toBe('dark');
});

test('valet under Konto gäller och sparas, och går att byta tillbaka till enhetens', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/konto');
  const group = page.getByRole('radiogroup', { name: 'Utseende' });
  await expect(group.getByRole('radio', { name: 'Följ enheten' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await group.getByRole('radio', { name: 'Mörkt' }).click();
  await expect(group.getByRole('radio', { name: 'Mörkt' })).toHaveAttribute('aria-checked', 'true');
  expect(await theme(page)).toBe('dark');
  expect(await canvas(page)).toBe(DARK_CANVAS);

  // Sparat i webbläsaren och på plats direkt vid nästa laddning, även om enheten är ljus.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  expect(await theme(page)).toBe('dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await group.getByRole('radio', { name: 'Ljust' }).click();
  expect(await theme(page)).toBe('light');
  expect(await canvas(page)).toBe(LIGHT_CANVAS);

  await group.getByRole('radio', { name: 'Följ enheten' }).click();
  expect(await theme(page)).toBe('dark');
  expect(await page.evaluate(() => localStorage.getItem('renoveringskollen-tema'))).toBeNull();
});

test('utskrift och PDF är alltid ljusa, även från mörkt läge', async ({ page }) => {
  await signInAsOwner(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/forsaljning');
  await expect(page.getByRole('heading', { name: 'Husets renoveringshistorik' })).toBeVisible();
  expect(await theme(page)).toBe('dark');

  await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
  const colors = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      ink: style.getPropertyValue('--color-ink').trim(),
      surface: style.getPropertyValue('--color-surface').trim(),
      body: getComputedStyle(document.body).backgroundColor,
    };
  });
  expect(colors).toEqual({ ink: '#26231f', surface: '#ffffff', body: 'rgb(255, 255, 255)' });
});

test('sidor har inget sidledsscroll i mörkt läge på mobil', async ({ page }) => {
  await signInAsOwner(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ['/', '/projekt', '/utgifter', '/underhall', '/konto']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await theme(page)).toBe('dark');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `sidledsscroll på ${path}`).toBeLessThanOrEqual(0);
  }
});
