import { expect, test } from '@playwright/test';
import { fillNewAccount, MEMBER, OWNER, signInAsOwner } from './helpers.ts';

// Inloggning, utloggning och inbjudan av en hushållsmedlem.

test.describe.configure({ mode: 'serial' });

test('skickar till inloggning och sedan tillbaka till sidan man ville se', async ({ page }) => {
  await signInAsOwner(page); // ser till att ägaren finns
  await page.context().clearCookies();

  await page.goto('/utgifter?q=klinker');
  await expect(page).toHaveURL(/\/logga-in\?till=%2Futgifter%3Fq%3Dklinker$/);

  await page.getByLabel('E-post').fill(OWNER.email);
  await page.getByLabel('Lösenord').fill('fel lösenord');
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Fel e-postadress eller lösenord');

  await page.getByLabel('Lösenord').fill(OWNER.password);
  await page.getByRole('button', { name: 'Logga in' }).click();
  await expect(page).toHaveURL(/\/utgifter\?q=klinker$/);
  await expect(page.getByRole('heading', { name: 'Utgifter' })).toBeVisible();
});

test('ägaren bjuder in en medlem som kan logga in men inte hantera hushållet', async ({
  page,
  browser,
}) => {
  await signInAsOwner(page);
  await page.goto('/konto');
  await page.getByLabel('Anteckning').fill('Till medlemmen');
  await page.getByRole('button', { name: 'Skapa inbjudan' }).click();
  const link = await page.getByLabel('Inbjudningslänk').inputValue();
  expect(link).toMatch(/\/inbjudan\/[\w-]{40,}$/);

  // Medlemmen öppnar länken i en egen webbläsare utan inloggning.
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(link);
  await expect(member.getByRole('heading', { name: 'Du är inbjuden' })).toBeVisible();
  await fillNewAccount(member, MEMBER);
  await expect(member.getByRole('heading', { name: 'Översikt' })).toBeVisible();

  // Medlemmen ser hushållets data men inte medlemshanteringen.
  await member.goto('/projekt');
  await expect(member.getByRole('link', { name: /Nytt badrum/ })).toBeVisible();
  await member.goto('/konto');
  await expect(member.getByRole('heading', { name: 'Konto' })).toBeVisible();
  await expect(member.getByRole('heading', { name: 'Hushållet' })).toHaveCount(0);

  // Länken går inte att använda igen.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto(link);
  await expect(other.getByRole('heading', { name: 'Inbjudan gäller inte' })).toBeVisible();

  // Ägaren ser att inbjudan använts.
  await page.reload();
  await expect(page.getByText(`Använd av ${MEMBER.name}`)).toBeVisible();
  await memberContext.close();
  await otherContext.close();
});

test('utloggning stänger sessionen', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/konto');
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(page).toHaveURL(/\/logga-in$/);

  await page.goto('/projekt');
  await expect(page).toHaveURL(/\/logga-in\?till=%2Fprojekt$/);
  const api = await page.request.get('/api/projects');
  expect(api.status()).toBe(401);
});
