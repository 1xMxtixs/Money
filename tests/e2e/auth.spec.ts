import { test, expect, type Page } from '@playwright/test';
import { createInvitation } from '../../lib/auth/invitations';
import {
  unscopedDeleteInvitation,
  unscopedFindUserByEmail,
  usersRepo,
} from '../../lib/repos';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'una contraseña muy larga 123';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set: the auth e2e needs PostgreSQL to mint invitations.');
}

const emails: string[] = [];
const invitationIds: string[] = [];

async function newInvitation() {
  const { code, invitation } = await createInvitation();
  invitationIds.push(invitation.id);
  return code;
}

function uniqueEmail(tag: string) {
  const email = `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  emails.push(email);
  return email;
}

async function registerViaUi(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Código de invitación').fill(await newInvitation());
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  // El destino (/dashboard) aún no existe y responde 404: sólo importa la navegación.
  // La sesión se comprueba después contra /api/auth/session.
  await page.waitForURL('**/dashboard');
}

test.afterAll(async () => {
  for (const email of emails) {
    const user = await unscopedFindUserByEmail(email);
    if (user) await usersRepo(user.id).delete();
  }
  for (const id of invitationIds) await unscopedDeleteInvitation(id);
});

test.describe('registro, login y cierre de sesión global (F0-12)', () => {
  // Los textos se buscan en español; el idioma se detecta por Accept-Language.
  test.use({ locale: 'es-CL' });

  test('canjear invitación -> registrarse -> sesión iniciada', async ({ page }) => {
    const email = uniqueEmail('reg');
    await registerViaUi(page, email);
    const res = await page.request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    expect((await res.json()).user.email).toBe(email);
  });

  test('página de login: contraseña incorrecta muestra el mensaje; la correcta inicia sesión', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('login');
    const reg = await request.post(`${ORIGIN}/api/auth/register`, {
      data: { invitationCode: await newInvitation(), email, password: PASSWORD },
      headers: { origin: ORIGIN },
    });
    expect(reg.status()).toBe(201);

    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(email);
    await page.getByLabel('Contraseña').fill('otra frase que no coincide');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.locator('form').getByRole('alert')).toHaveText('El correo o la contraseña no coinciden.');

    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/dashboard');
    expect((await page.request.get('/api/auth/session')).status()).toBe(200);
  });

  test('logout-all deja fuera a la otra pestaña en su petición siguiente', async ({ browser }) => {
    const first = await browser.newContext({ locale: 'es-CL' });
    const page = await first.newPage();
    const email = uniqueEmail('all');
    await registerViaUi(page, email);

    // Segundo contexto con otra sesión del mismo usuario (login real, no copia de cookie).
    const second = await browser.newContext();
    const login = await second.request.post(`${ORIGIN}/api/auth/login`, {
      data: { email, password: PASSWORD },
      headers: { origin: ORIGIN },
    });
    expect(login.status()).toBe(200);
    expect((await second.request.get(`${ORIGIN}/api/auth/session`)).status()).toBe(200);

    const out = await page.request.post('/api/auth/logout-all', { headers: { origin: ORIGIN } });
    expect(out.status()).toBe(204);

    expect((await second.request.get(`${ORIGIN}/api/auth/session`)).status()).toBe(401);
    expect((await page.request.get('/api/auth/session')).status()).toBe(401);
    await first.close();
    await second.close();
  });
});
