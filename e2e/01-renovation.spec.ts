import { expect, test } from '@playwright/test';
import { fillNewAccount, OWNER, signInAsOwner } from './helpers.ts';

// Huvudflödet från början till slut mot en tom databas:
// första start → rum → projekt → utgift med kvitto → uppgift → översikt, sök och rapport.

const year = new Date().getFullYear();
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');
// Belopp formateras med hårt mellanslag; \s matchar även det.
const sek = (s: string) => new RegExp(s.replace(/ /g, '\\s'));

test('logga en renovering från rum till rapport', async ({ page }) => {
  await test.step('första start skapar ägarkontot', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/forsta-start$/);
    await fillNewAccount(page, OWNER);
    await expect(page.getByRole('heading', { name: 'Översikt' })).toBeVisible();
    await expect(page.getByText('Välkommen!')).toBeVisible();
  });

  await test.step('skapa rum', async () => {
    await page.goto('/rum');
    await page.getByRole('button', { name: 'Nytt rum' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Namn').fill('Badrum');
    await dialog.getByLabel('Yta (m²)').fill('6,5');
    await dialog.getByRole('button', { name: 'Spara' }).click();
    await expect(page.getByRole('link', { name: /Badrum/ })).toBeVisible();
  });

  await test.step('skapa projekt kopplat till rummet', async () => {
    await page
      .getByRole('navigation', { name: 'Huvudmeny' })
      .first()
      .getByRole('link', { name: 'Projekt' })
      .click();
    await page.getByRole('button', { name: 'Nytt projekt' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Namn på projektet').fill('Nytt badrum');
    await dialog.getByLabel('Budget (kr)').fill('50 000');
    await dialog.getByLabel('Status').selectOption('pagaende');
    await dialog.getByRole('checkbox', { name: 'Badrum' }).check({ force: true });
    await dialog.getByRole('button', { name: 'Skapa projekt' }).click();
    await expect(page).toHaveURL(/\/projekt\/\d+$/);
    await expect(page.getByRole('heading', { name: /Nytt badrum/ })).toBeVisible();
  });

  await test.step('lägg till utgift med kvitto', async () => {
    await page.getByRole('tab', { name: 'Utgifter' }).click();
    await page.getByRole('button', { name: 'Ny utgift' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Vad köptes?').fill('Klinker 30×60');
    await dialog.getByLabel('Belopp (kr)').fill('3 249,90');
    await dialog.getByLabel('Butik / firma').fill('Bauhaus');
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'kvitto-klinker.pdf', mimeType: 'application/pdf', buffer: pdf });
    await expect(dialog.getByText('kvitto-klinker.pdf')).toBeVisible();
    await dialog.getByRole('button', { name: 'Spara' }).click();
    await expect(dialog).toBeHidden();

    const row = page.getByRole('button', { name: /Klinker 30×60/ });
    await expect(row).toContainText(sek('3 249,90 kr'));
    await expect(row.getByLabel('Kvitto bifogat')).toBeVisible();
    await expect(page.getByText('Spenderat').locator('..')).toContainText(sek('3 249,90 kr'));

    // Kvittot går att öppna och är den fil vi laddade upp.
    await row.click();
    const link = page.getByRole('link', { name: 'Öppna kvitto-klinker.pdf' });
    const file = await page.request.get((await link.getAttribute('href'))!);
    expect(file.headers()['content-type']).toBe('application/pdf');
    expect(Buffer.from(await file.body()).equals(pdf)).toBe(true);
  });

  await test.step('lägg till och bocka av en uppgift', async () => {
    await page.getByRole('tab', { name: 'Uppgifter' }).click();
    await page.getByLabel('Ny uppgift').fill('Fogning');
    await page.getByRole('button', { name: 'Lägg till' }).click();
    await page.getByRole('checkbox', { name: /Fogning/ }).check();
    await expect(page.getByText('Uppgifter klara').locator('..')).toContainText('1 av 1');
  });

  await test.step('översikten visar årets utgifter och ROT-underlag', async () => {
    await page
      .getByRole('navigation', { name: 'Huvudmeny' })
      .first()
      .getByRole('link', { name: 'Översikt' })
      .click();
    await expect(page.getByText(`Spenderat ${year}`).locator('..')).toContainText(
      sek('3 249,90 kr'),
    );
    await expect(
      page.getByRole('heading', { name: `Underlag för ROT-avdrag ${year}` }),
    ).toBeVisible();
    await expect(page.getByText(`Inga arbetskostnader registrerade ${year}.`)).toBeVisible();
  });

  await test.step('sök hittar utgiften oavsett versaler', async () => {
    await page.goto('/utgifter');
    await page.getByRole('searchbox', { name: 'Sök' }).fill('KLINK');
    await expect(page.getByText(/^1 utgift/)).toBeVisible();
    await expect(page.getByRole('cell', { name: /Klinker 30×60/ })).toBeVisible();
  });

  await test.step('rapporten innehåller projektet och utgiften', async () => {
    await page.goto('/rapport');
    await expect(page.getByRole('heading', { name: 'Renoveringshistorik' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nytt badrum' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Klinker 30×60' })).toBeVisible();
    await expect(page.getByText('Fogning')).toBeVisible();
  });

  await test.step('skriv upp färg och material i rummet', async () => {
    await page.goto('/rum');
    await page.getByRole('link', { name: /Badrum/ }).click();
    await page.getByRole('button', { name: 'Lägg till material' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Vad för färg?').fill('Takfärg');
    await dialog.getByLabel('Yta').selectOption('tak');
    await dialog.getByLabel('Märke / tillverkare').fill('Alcro');
    await dialog.getByLabel('Kulörkod').fill('NCS S 0500-N');
    await dialog.getByLabel('Glans').fill('Helmatt 2');
    await dialog.getByLabel('Färgruta (hex)').fill('#F7F7F5');
    await dialog.getByRole('button', { name: 'Spara' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Alcro · NCS S 0500-N · Helmatt 2')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Färgprov NCS S 0500-N' })).toBeVisible();

    await page.getByRole('button', { name: 'Lägg till material' }).click();
    await dialog.getByLabel('Typ').selectOption('material');
    await dialog.getByLabel('Yta').selectOption('golv');
    await dialog.getByLabel('Material').fill('Klinker 30×60');
    await dialog.getByLabel('Märke / tillverkare').fill('Bauhaus');
    // Första valet efter "Ingen koppling" är rummets enda utgift, klinkern.
    await dialog.getByLabel('Utgift / kvitto').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Spara' }).click();
    await expect(dialog).toBeHidden();
    // Kopplingen till utgiften syns som länk till kvittot.
    await expect(page.getByRole('link', { name: 'Klinker 30×60' })).toBeVisible();
  });

  await test.step('försäljningsunderlaget samlar projekt, material och år', async () => {
    await page.goto('/forsaljning');
    await expect(page.getByRole('heading', { name: 'Husets renoveringshistorik' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Nytt badrum/ })).toBeVisible();
    await expect(page.getByText('Takfärg')).toBeVisible();
    await expect(page.getByText(/Alcro · NCS S 0500-N/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Underlag för deklarationen' })).toBeVisible();
    await expect(page.getByRole('cell', { name: String(year), exact: true })).toBeVisible();
  });
});

test('mobil: bottenmeny och ingen sidledsscroll @mobil', async ({ page }) => {
  await signInAsOwner(page);
  for (const path of [
    '/',
    '/projekt',
    '/utgifter',
    '/rum',
    '/underhall',
    '/hantverkare',
    '/konto',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `sidledsscroll på ${path}`).toBeLessThanOrEqual(0);
  }
  const bottomNav = page.getByRole('navigation', { name: 'Huvudmeny' }).last();
  await expect(bottomNav).toBeVisible();
  await bottomNav.getByRole('link', { name: 'Utgifter' }).click();
  await expect(page).toHaveURL(/\/utgifter$/);

  // Fyra flikar plus "Mer"; resten ligger i menyn som stängs vid val, tryck utanför och Esc.
  await expect(bottomNav.getByRole('link')).toHaveCount(4);
  const more = bottomNav.getByRole('button', { name: 'Mer' });
  await more.click();
  const menu = page.locator('#more-menu');
  await expect(menu.getByRole('link')).toHaveCount(5);
  await page.getByRole('button', { name: 'Stäng menyn' }).click({ position: { x: 20, y: 200 } });
  await expect(menu).toHaveCount(0);
  await more.click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await more.click();
  await menu.getByRole('link', { name: 'Hantverkare' }).click();
  await expect(page).toHaveURL(/\/hantverkare$/);
  await expect(menu).toHaveCount(0);

  // Filtren på Utgifter ligger bakom en knapp på mobil.
  await page.goto('/utgifter');
  const filters = page.locator('#expense-filters');
  await expect(filters).toBeHidden();
  await page.getByRole('button', { name: /^Filter/ }).click();
  await expect(filters).toBeVisible();
});
