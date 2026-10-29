import { expect, test } from '@playwright/test';
import { MEMBER, signInAsOwner } from './helpers.ts';

// Bygger på medlemmen från 02-auth. Servern sparar kopiorna i e2e/.tmp/backups.

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

test('ägaren skapar och laddar ner en säkerhetskopia under Konto', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/konto');
  const card = page.getByRole('heading', { name: 'Säkerhetskopia' }).locator('..');
  await expect(card.getByText('Inga kopior ännu.')).toBeVisible();

  await card.getByRole('button', { name: 'Säkerhetskopiera nu' }).click();
  await expect(card.getByRole('status')).toContainText('Kopia skapad');

  const downloads = card.getByRole('link', { name: /^Ladda ner kopian/ });
  await expect(downloads).toHaveCount(1);
  const href = await downloads.getAttribute('href');
  expect(href).toMatch(/^\/api\/backups\/renoveringskollen-\d{8}-\d{6}\.tar\.gz\/download$/);

  // Filen är en gzip-fil, och den hämtas som nedladdning.
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-disposition']).toContain('attachment');
  const body = await res.body();
  expect(body.subarray(0, 2).toString('hex')).toBe('1f8b');
  expect(body.length).toBeGreaterThan(100);
});

test('en medlem ser inte säkerhetskopior och kan inte hämta dem', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', {
    data: { email: MEMBER.email, password: MEMBER.password },
    headers: CSRF,
  });
  expect(login.ok(), `inloggning som medlem: ${login.status()}`).toBe(true);

  await page.goto('/konto');
  await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Säkerhetskopia' })).toHaveCount(0);
  expect((await page.request.get('/api/backups')).status()).toBe(403);
  expect((await page.request.post('/api/backups', { headers: CSRF })).status()).toBe(403);
});
