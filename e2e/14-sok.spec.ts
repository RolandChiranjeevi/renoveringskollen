import { expect, test } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

let projectId: number;

test.beforeAll(async ({ browser }) => {
  // Egen testdata, så att sökspecen inte beror på vad tidigare specar lämnat efter sig.
  const page = await browser.newPage();
  await signInAsOwner(page);
  const post = async (url: string, data: object) =>
    (await (await page.request.post(url, { data, headers: CSRF })).json()) as { id: number };
  const room = await post('/api/rooms', { name: 'Sökrummet', floor: 'Plan 3' });
  projectId = (await post('/api/projects', { title: 'Sökprojekt', roomIds: [room.id] })).id;
  await post('/api/notes', {
    projectId,
    content:
      'Elektrikern kommer på måndag.\nHusets huvudsäkring är 20 A, så kontrollera att det räcker för den nya induktionshällen.',
  });
  await post(`/api/rooms/${room.id}/materials`, {
    surface: 'vagg',
    type: 'farg',
    name: 'Sökfärg',
    brand: 'Alcro',
    colorCode: 'NCS S 0502-Y',
  });
  await post(`/api/projects/${projectId}/tasks`, { title: 'Beställ sökbara lister' });
  await page.close();
});

test('"/" öppnar sökningen och träffar leder rakt till rätt flik', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Översikt' })).toBeVisible();

  await page.keyboard.press('/');
  await expect(page).toHaveURL(/\/sok$/);
  const input = page.getByRole('searchbox', { name: 'Sök' });
  await expect(input).toBeFocused();
  await expect(page.getByText('Skriv minst två tecken')).toBeVisible();

  await input.fill('huvudsäkring');
  await expect(page).toHaveURL(/\/sok\?q=huvuds%C3%A4kring$/);
  const group = page.getByRole('region', { name: /Anteckningar/ });
  await expect(group).toContainText('Elektrikern kommer på måndag.');
  await expect(group).toContainText('Sökprojekt');
  // Utdraget kring träffen visas, med sökordet markerat.
  await expect(group.locator('mark')).toHaveText('huvudsäkring');
  await expect(page.getByRole('status').first()).toContainText('1 träff');

  await group.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`/projekt/${projectId}\\?flik=anteckningar$`));
  // Vänta tills projektsidan har ersatt sökresultaten: fliken är vald och anteckningen ligger i den.
  await expect(page.getByRole('tab', { name: 'Anteckningar' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('tabpanel').getByText('Elektrikern kommer på måndag.')).toBeVisible();
});

test('flera ord måste alla finnas, men får ligga i olika fält', async ({ page }) => {
  await signInAsOwner(page);
  await page.goto('/sok?q=alcro%20s%C3%B6krummet');
  const material = page.getByRole('region', { name: /Material och färg/ });
  await expect(material).toContainText('Sökfärg');
  await expect(material).toContainText('Sökrummet · Alcro · NCS S 0502-Y');
  await material.getByRole('link').click();
  await expect(page).toHaveURL(/\/rum\/\d+$/);

  await page.goto('/sok?q=alcro%20finnsinte');
  await expect(page.getByText('Inga träffar på ”alcro finnsinte”')).toBeVisible();
  await expect(page.getByRole('region')).toHaveCount(0);
});

test('sökningen sparas i adressen, skiljer inte på versaler och går att rensa', async ({
  page,
}) => {
  await signInAsOwner(page);
  await page.goto('/sok?q=S%C3%96KBARA');
  await expect(page.getByRole('region', { name: /Uppgifter/ })).toContainText(
    'Beställ sökbara lister',
  );
  await expect(page.getByRole('searchbox', { name: 'Sök' })).toHaveValue('SÖKBARA');

  await page.reload();
  await expect(page.getByRole('region', { name: /Uppgifter/ })).toBeVisible();

  await page.getByRole('button', { name: 'Rensa sökningen' }).click();
  await expect(page).toHaveURL(/\/sok$/);
  await expect(page.getByText('Skriv minst två tecken')).toBeVisible();
});

test('på mobil finns sökning i toppfältet och sidan får inget sidledsscroll', async ({ page }) => {
  await signInAsOwner(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Sök', exact: true }).click();
  await expect(page).toHaveURL(/\/sok$/);
  await page.getByRole('searchbox', { name: 'Sök' }).fill('sök');
  await expect(page.getByRole('region').first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
