import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Bygger på projektet "Nytt badrum" (med 3 249,90 kr i material och 50 000 kr i budget) från 01-renovation.

const CSRF = { 'x-renoveringskollen': '1' };
// Belopp formateras med hårt mellanslag; \s matchar även det.
const sek = (s: string) => new RegExp(s.replace(/ /g, '\\s'));

/** Datum ÅÅÅÅ-MM-DD som ligger `days` dagar från idag (lokal tid, som webbläsaren och servern). */
function isoIn(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test.describe.configure({ mode: 'serial' });

async function badrumId(page: Page) {
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const project = projects.find((p) => p.title === 'Nytt badrum');
  expect(project, 'projektet "Nytt badrum" från första testet').toBeTruthy();
  return project!.id;
}

test('översikten visar försenade uppgifter och garantier som snart löper ut', async ({ page }) => {
  await signInAsOwner(page);
  const id = await badrumId(page);
  await page.request.post(`/api/projects/${id}/tasks`, {
    data: { title: 'Beställ duschvägg', dueDate: isoIn(-2), priority: 'hog' },
    headers: CSRF,
  });
  await page.request.post('/api/projects', {
    data: { title: 'Altan olja', warrantyUntil: isoIn(30) },
    headers: CSRF,
  });

  await page.goto('/');
  const card = page.getByRole('heading', { name: 'Kommande', exact: true }).locator('..');
  await expect(card).toContainText('Beställ duschvägg');
  await expect(card).toContainText('2 dagar försenad');
  await expect(card).toContainText('Hög prioritet');
  await expect(card).toContainText('Altan olja');
  await expect(card).toContainText('om 30 dagar');

  await card.getByRole('link', { name: /Beställ duschvägg/ }).click();
  await expect(page).toHaveURL(/\/projekt\/\d+\?flik=uppgifter$/);
  await expect(page.getByText('Beställ duschvägg')).toBeVisible();
});

test('en klar uppgift försvinner från Kommande', async ({ page }) => {
  await signInAsOwner(page);
  const id = await badrumId(page);
  await page.goto(`/projekt/${id}?flik=uppgifter`);
  await page.getByRole('checkbox', { name: /Beställ duschvägg/ }).check();
  await expect(page.getByText('Uppgifter klara').locator('..')).toContainText('2 av 2');

  await page.goto('/');
  const card = page.getByRole('heading', { name: 'Kommande', exact: true }).locator('..');
  await expect(card).toContainText('Altan olja');
  await expect(card).not.toContainText('Beställ duschvägg');
});

test('fördela budgeten per kategori och se utfall och överskridande', async ({ page }) => {
  await signInAsOwner(page);
  const id = await badrumId(page);
  await page.goto(`/projekt/${id}`);
  // Före fördelningen visas redan spenderat material, men utan budget.
  await expect(page.getByText(sek('3 249,90 kr · ingen budget'))).toBeVisible();

  await page.getByRole('button', { name: 'Fördela budget' }).click();
  const dialog = page.getByRole('dialog');

  // Ogiltigt belopp nekas innan något skickas.
  await dialog.getByLabel('Material (kr)').fill('tusen');
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog.getByText(/Ange ett belopp/)).toBeVisible();

  await dialog.getByLabel('Material (kr)').fill('40 000');
  await dialog.getByLabel('Arbetskostnad (kr)').fill('10 000');
  await expect(
    dialog.getByText(sek('Fördelat 50 000,00 kr av projektets budget 50 000,00 kr')),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();

  await expect(page.getByText(sek('3 249,90 kr av 40 000,00 kr'))).toBeVisible();
  await expect(page.getByText(sek('0,00 kr av 10 000,00 kr'))).toBeVisible();
  await expect(
    page.getByText(sek('Fördelat 50 000,00 kr av projektets budget 50 000,00 kr')),
  ).toBeVisible();

  // Sänk materialbudgeten under det som redan spenderats.
  await page.getByRole('button', { name: 'Fördela budget' }).click();
  await dialog.getByLabel('Material (kr)').fill('3 000');
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(sek('Över budget med 249,90 kr'))).toBeVisible();
  await expect(page.getByText(sek('37 000,00 kr ofördelat'))).toBeVisible();
});

test('kategorierna delar upp totalbudgeten: den höjs automatiskt och kan inte sättas lägre', async ({
  page,
}) => {
  await signInAsOwner(page);
  // Projektets budget 1 500 kr, kategorier 1 250 + 750 = 2 000 kr, spenderat 979 + 650 = 1 629 kr.
  const created = await (
    await page.request.post('/api/projects', {
      data: { title: 'Ommålning', budgetOre: 150_000 },
      headers: CSRF,
    })
  ).json();
  for (const [category, amountOre] of [
    ['material', 97_900],
    ['verktyg', 65_000],
  ] as const) {
    await page.request.post(`/api/projects/${created.id}/expenses`, {
      data: { date: isoIn(0), description: `Ommålning ${category}`, category, amountOre },
      headers: CSRF,
    });
  }

  await page.goto(`/projekt/${created.id}`);
  await expect(page.getByText('Över budget', { exact: true }).locator('..')).toContainText(
    sek('129,00 kr'),
  );

  await page.getByRole('button', { name: 'Fördela budget' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Material (kr)').fill('1 250');
  await dialog.getByLabel('Verktyg (kr)').fill('750');
  await expect(
    dialog.getByText(
      sek('Fördelat 2 000,00 kr · projektets budget höjs från 1 500,00 kr till 2 000,00 kr'),
    ),
  ).toBeVisible();
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();

  // Rutan överst stämmer nu med fördelningen: 2 000 kr budget och 371 kr kvar. Ingen varning behövs.
  await expect(page.getByText('Budget', { exact: true }).locator('..')).toContainText(
    sek('2 000,00 kr'),
  );
  await expect(page.getByText('Kvar av budget', { exact: true }).locator('..')).toContainText(
    sek('371,00 kr'),
  );
  await expect(page.getByRole('status').filter({ hasText: 'Du har fördelat' })).toHaveCount(0);

  // Totalbudgeten kan inte sänkas under det som fördelats.
  await page.getByRole('button', { name: 'Redigera', exact: true }).click();
  const edit = page.getByRole('dialog');
  await edit.getByLabel('Budget (kr)').fill('1 000');
  await edit.getByRole('button', { name: 'Spara' }).click();
  await expect(edit.getByText(/lägre än det som fördelats på kategorier/)).toBeVisible();
  await expect(edit).toBeVisible();
});

test('diagrammets y-axel ryms inom kortet, på både bred och smal skärm', async ({ page }) => {
  await signInAsOwner(page);
  // Egen testdata så att diagrammet finns även när testet körs ensamt.
  const project = await (
    await page.request.post('/api/projects', { data: { title: 'Diagramtest' }, headers: CSRF })
  ).json();
  await page.request.post(`/api/projects/${project.id}/expenses`, {
    data: {
      date: isoIn(0),
      description: 'Diagramutgift',
      category: 'material',
      amountOre: 1_249_000,
    },
    headers: CSRF,
  });

  for (const size of [
    { width: 1280, height: 900 },
    { width: 375, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const axis = page.getByTestId('y-axis');
    await expect(axis).toBeAttached();

    const card = page.locator('div.rounded-xl:has(figure)').first();
    const cardBox = (await card.boundingBox())!;
    const labels = await axis.locator('span').all();
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      const box = (await label.boundingBox())!;
      const where = `${size.width}px bred skärm: "${await label.textContent()}"`;
      expect(box.x, `${where} sticker ut till vänster`).toBeGreaterThanOrEqual(cardBox.x);
      expect(box.x + box.width, `${where} sticker ut till höger`).toBeLessThanOrEqual(
        cardBox.x + cardBox.width,
      );
    }
  }
});
