import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

let projectId: number;

async function project(page: Page) {
  return (await page.request.get(`/api/projects/${projectId}`)).json();
}

test('offerter från två hantverkare jämförs sida vid sida, billigast först', async ({ page }) => {
  await signInAsOwner(page);
  projectId = (
    await (
      await page.request.post('/api/projects', { data: { title: 'Fönsterbyte' }, headers: CSRF })
    ).json()
  ).id;
  await page.request.post('/api/contractors', {
    data: { name: 'Snickeri Svensson' },
    headers: CSRF,
  });

  await page.goto(`/projekt/${projectId}?flik=offerter`);
  await expect(page.getByText('Inga offerter ännu')).toBeVisible();

  // Offert 1: sparad hantverkare.
  await page.getByRole('button', { name: 'Ny offert' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Från vem?').selectOption({ label: 'Snickeri Svensson' });
  await dialog.getByLabel('Pris (kr)').fill('85 000');
  await dialog.getByLabel('Vad ingår?').fill('Fönster och montering');
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();

  // Offert 2: bara ett namn, billigare och med giltighetstid som snart går ut.
  await page.getByRole('button', { name: 'Ny offert' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Från vem?').selectOption({ label: 'Annan (skriv namn)…' });
  await dialog.getByLabel('Namn').fill('Glas & Ram AB');
  await dialog.getByLabel('Pris (kr)').fill('70 000');
  const soon = new Date();
  soon.setDate(soon.getDate() + 5);
  const p = (n: number) => String(n).padStart(2, '0');
  await dialog
    .getByLabel('Gäller till')
    .fill(`${soon.getFullYear()}-${p(soon.getMonth() + 1)}-${p(soon.getDate())}`);
  await dialog.getByRole('button', { name: 'Spara' }).click();
  await expect(dialog).toBeHidden();

  const cards = page.getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('Glas & Ram AB');
  await expect(cards.nth(0)).toContainText('Billigast');
  await expect(cards.nth(0)).toContainText('Gäller i 5 dagar till');
  await expect(cards.nth(1)).toContainText('Snickeri Svensson');
  await expect(cards.nth(1)).toContainText(/15\s000,00\skr mer än billigast \(\+21 %\)/);

  // Sida vid sida: korten ligger på samma rad på en bred skärm.
  const tops = await cards.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(Math.abs(tops[0]! - tops[1]!)).toBeLessThan(2);
});

test('att välja en offert sätter projektets hantverkare och budget, och går att byta eller ångra', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto(`/projekt/${projectId}?flik=offerter`);
  page.on('dialog', (d) => d.accept());

  await page.getByRole('button', { name: 'Välj offert från Snickeri Svensson' }).click();
  await expect(page.getByRole('article', { name: /Snickeri Svensson/ })).toContainText('Vald');
  let current = await project(page);
  expect(current.budgetOre).toBe(8_500_000);
  expect(current.contractor?.name).toBe('Snickeri Svensson');

  // Byt till den andra: den första blir ovald, och en hantverkare skapas av namnet.
  await page.getByRole('button', { name: 'Välj offert från Glas & Ram AB' }).click();
  await expect(page.getByRole('article', { name: /Glas & Ram AB/ })).toContainText('Vald');
  await expect(page.getByRole('article', { name: /Snickeri Svensson/ })).not.toContainText('Vald');
  current = await project(page);
  expect(current.budgetOre).toBe(7_000_000);
  expect(current.contractor?.name).toBe('Glas & Ram AB');

  // Ångra val lämnar projektet som det är.
  await page.getByRole('button', { name: 'Ångra val' }).click();
  await expect(page.getByText('Vald', { exact: true })).toHaveCount(0);
  expect((await project(page)).budgetOre).toBe(7_000_000);
});

test('en offert som är lägre än fördelade kategoribudgetar kan inte väljas, och går att ta bort', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.request.put(`/api/projects/${projectId}/budgets`, {
    data: { budgets: { material: 6_000_000, arbete: 2_000_000 } },
    headers: CSRF,
  });
  await page.goto(`/projekt/${projectId}?flik=offerter`);
  page.on('dialog', (d) => d.accept());

  // 70 000 kr är lägre än de 80 000 kr som fördelats.
  await page.getByRole('button', { name: 'Välj offert från Glas & Ram AB' }).click();
  await expect(page.getByRole('alert')).toContainText('lägre än det som fördelats på kategorier');
  expect((await project(page)).contractor?.name).toBe('Glas & Ram AB');

  await page.getByRole('button', { name: 'Ta bort offert från Glas & Ram AB' }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
});
