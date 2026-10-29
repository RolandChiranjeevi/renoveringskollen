import { expect, test } from '@playwright/test';
import { MEMBER, OWNER, signInAsOwner } from './helpers.ts';

// Bygger på medlemmen från 02-auth och projektet "Ny altan" från 05-bilder.

const CSRF = { 'x-renoveringskollen': '1' };

test.describe.configure({ mode: 'serial' });

test('uppgifter och anteckningar visar vem som lade till dem när hushållet har flera medlemmar', async ({
  page,
}) => {
  // Medlemmen lägger till en uppgift och en anteckning.
  const login = await page.request.post('/api/auth/login', {
    data: { email: MEMBER.email, password: MEMBER.password },
    headers: CSRF,
  });
  expect(login.ok(), `inloggning som medlem: ${login.status()}`).toBe(true);
  const projects: { id: number; title: string }[] = await (
    await page.request.get('/api/projects')
  ).json();
  const project = projects.find((p) => p.title === 'Ny altan');
  expect(project, 'projektet "Ny altan" från 05-bilder').toBeTruthy();
  await page.request.post(`/api/projects/${project!.id}/tasks`, {
    data: { title: 'Måla taket' },
    headers: CSRF,
  });
  await page.request.post('/api/notes', {
    data: { projectId: project!.id, content: 'Taket behöver två strykningar' },
    headers: CSRF,
  });
  await page.request.post('/api/auth/logout', { headers: CSRF });

  // Ägaren ser vem som gjorde vad, och sina egna poster under eget namn.
  await signInAsOwner(page);
  await page.request.post(`/api/projects/${project!.id}/tasks`, {
    data: { title: 'Köp färg' },
    headers: CSRF,
  });
  await page.goto(`/projekt/${project!.id}?flik=uppgifter`);
  const memberTask = page.getByText('Måla taket').locator('..');
  await expect(memberTask).toContainText(`tillagd av ${MEMBER.name}`);
  await expect(page.getByText('Köp färg').locator('..')).toContainText(`tillagd av ${OWNER.name}`);

  await page.goto(`/projekt/${project!.id}?flik=anteckningar`);
  await expect(page.getByText('Taket behöver två strykningar').locator('..')).toContainText(
    `tillagd av ${MEMBER.name}`,
  );
});
