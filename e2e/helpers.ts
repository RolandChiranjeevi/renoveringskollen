import { expect, type Page } from '@playwright/test';

// Testkonton. Bara för E2E-databasen i e2e/.tmp.
export const OWNER = {
  name: 'Testägare',
  email: 'agare@e2e.test',
  password: 'en lång lösenfras för e2e',
};
export const MEMBER = {
  name: 'Testmedlem',
  email: 'medlem@e2e.test',
  password: 'medlemmens långa lösenord',
};

const CSRF = { 'x-renoveringskollen': '1' };

/**
 * Ser till att ägarkontot finns och att sidan är inloggad som ägaren, via API:t (snabbt).
 * page.request delar cookies med sidan, så sessionen gäller även i webbläsaren.
 */
export async function signInAsOwner(page: Page) {
  const status = await (await page.request.get('/api/auth/status')).json();
  const url = status.setupRequired ? '/api/auth/setup' : '/api/auth/login';
  const body = status.setupRequired ? OWNER : { email: OWNER.email, password: OWNER.password };
  const res = await page.request.post(url, { data: body, headers: CSRF });
  expect(res.ok(), `${url}: ${res.status()}`).toBe(true);
}

/** Fyller i ett formulär för nytt konto (första start eller inbjudan). */
export async function fillNewAccount(
  page: Page,
  account: { name: string; email: string; password: string },
) {
  await page.getByLabel('Ditt namn').fill(account.name);
  await page.getByLabel('E-post').fill(account.email);
  await page.getByLabel('Lösenord', { exact: true }).fill(account.password);
  await page.getByLabel('Upprepa lösenordet').fill(account.password);
  await page.getByRole('button', { name: 'Skapa konto' }).click();
}
