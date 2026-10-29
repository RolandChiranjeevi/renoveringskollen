import { expect, test } from '@playwright/test';
import { signInAsOwner } from './helpers.ts';

// Bygger på projektet "Ny altan" från 05-bilder: en före-bild (altan-fore), en efter-bild
// (altan-efter) och altan-detalj som flyttats till efter. Här läggs ett andra par till.

const CSRF = { 'x-renoveringskollen': '1' };
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000050001' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
);

test('försäljningsunderlaget visar alla före/efter-par med bildtext', async ({ page }) => {
  await signInAsOwner(page);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const projectId = projects.find((p) => p.title === 'Ny altan')!.id;

  // Ett andra före-foto med bildtext, och bildtext på det andra efter-fotot.
  const added = await page.request.post('/api/attachments', {
    headers: CSRF,
    multipart: {
      kind: 'fore',
      projectId: String(projectId),
      file: { name: 'altan-fore2.png', mimeType: 'image/png', buffer: PNG },
    },
  });
  const second = await added.json();
  await page.request.patch(`/api/attachments/${second.id}`, {
    headers: CSRF,
    data: { caption: 'Trappan före' },
  });
  const attachments: { id: number; originalName: string }[] = await (
    await page.request.get(`/api/attachments?projectId=${projectId}`)
  ).json();
  const detail = attachments.find((a) => a.originalName === 'altan-detalj.png')!;
  await page.request.patch(`/api/attachments/${detail.id}`, {
    headers: CSRF,
    data: { caption: 'Trappan efter' },
  });

  await page.goto('/forsaljning');

  // Första paret: före-bilden fick bildtexten "Altanen före rivning" i 05-bilder, efter-bilden saknar
  // bildtext och får därför en beskrivning av projektet. Andra paret har bildtext på båda.
  await expect(page.getByRole('img', { name: 'Altanen före rivning' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Ny altan, efter' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Trappan före' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Trappan efter' })).toBeVisible();
  await expect(page.getByText('Trappan före', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Trappan efter', { exact: false }).first()).toBeVisible();
});
