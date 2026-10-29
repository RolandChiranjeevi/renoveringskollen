import { expect, test, type Page } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Ett 1×1 pixlar stort PNG, tillräckligt för att servern ska godkänna filen.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);
const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

async function addPhoto(page: Page, projectId: number, kind: string, name: string) {
  const res = await page.request.post('/api/attachments', {
    headers: CSRF,
    multipart: {
      kind,
      projectId: String(projectId),
      file: { name, mimeType: 'image/png', buffer: PNG },
    },
  });
  expect(res.ok(), `${name}: ${res.status()}`).toBe(true);
}

test('före och efter visas sida vid sida och bilderna går att bläddra i med bildtext', async ({
  page,
}) => {
  await signInAsOwner(page);
  const project = await (
    await page.request.post('/api/projects', { data: { title: 'Ny altan' }, headers: CSRF })
  ).json();
  await addPhoto(page, project.id, 'fore', 'altan-fore.png');
  await addPhoto(page, project.id, 'efter', 'altan-efter.png');
  await addPhoto(page, project.id, 'ovrigt', 'altan-detalj.png');

  await page.goto(`/projekt/${project.id}?flik=bilder`);

  // Jämförelsen: ett par med Före till vänster och Efter till höger.
  const pair = page.getByRole('region', { name: 'Före och efter' });
  await expect(pair.getByRole('button')).toHaveCount(2);
  const lefts = await pair
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().left));
  expect(lefts[0]).toBeLessThan(lefts[1]!);

  // Bildvisaren öppnas från jämförelsen och visar position.
  await pair.getByRole('button', { name: /^Före/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Bildvisare' });
  await expect(viewer).toBeVisible();
  await expect(viewer).toContainText('1 av 3');
  await expect(viewer).toContainText('Före');

  // Bildtext sparas.
  await viewer.getByLabel('Bildtext').fill('Altanen före rivning');
  await viewer.getByRole('button', { name: 'Spara text' }).click();
  await expect(viewer.getByRole('button', { name: 'Spara text' })).toBeDisabled();

  // Piltangenter bläddrar, och det går runt i kanterna.
  await viewer.getByRole('button', { name: 'Nästa bild' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(viewer).toContainText('2 av 3');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(viewer).toContainText('3 av 3');

  // Esc stänger, och bildtexten syns på miniatyren.
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(page.getByText('Altanen före rivning').first()).toBeVisible();
});

test('en bild kan flyttas mellan typer i visaren, och paret består', async ({ page }) => {
  await signInAsOwner(page);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const project = projects.find((p) => p.title === 'Ny altan')!;
  await page.goto(`/projekt/${project.id}?flik=bilder`);

  await page.getByRole('link', { name: /Öppna altan-detalj\.png/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Bildvisare' });
  await viewer.getByLabel('Typ av bild').selectOption('efter');
  await page.keyboard.press('Escape');

  // Nu finns två Efter-bilder men bara en Före, så fortfarande ett par.
  const pair = page.getByRole('region', { name: 'Före och efter' });
  await expect(pair.getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: /^Efter/ })).toContainText('(2)');
});
