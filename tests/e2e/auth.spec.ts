import { test, expect, type Page } from '@playwright/test';
import { createInvitation } from '../../lib/auth/invitations';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'una contraseña muy larga 123';

async function registerViaUi(page: Page, email: string) {
  const { code } = await createInvitation();
  await page.goto('/register');
  await page.getByLabel('Código de invitación').fill(code);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  // Tras el alta se redirige; /dashboard aún no existe (F2-06), así que se comprueba la sesión.
  await page.waitForURL('**/dashboard');
}

test.describe('registro, login y cierre de sesión global (F0-12)', () => {
  // Los textos se buscan en español; el idioma se detecta por Accept-Language.
  test.use({ locale: 'es-CL' });

  test('canjear invitación -> registrarse -> sesión iniciada', async ({ page }) => {
    const email = `e2e-reg-${Date.now()}@example.com`;
    await registerViaUi(page, email);
    const res = await page.request.get('/api/auth/session');
    expect(res.status()).toBe(200);
    expect((await res.json()).user.email).toBe(email);
  });

  test('logout-all deja fuera a la otra pestaña en su petición siguiente', async ({ browser }) => {
    const first = await browser.newContext({ locale: 'es-CL' });
    const page = await first.newPage();
    await registerViaUi(page, `e2e-all-${Date.now()}@example.com`);

    // Segundo contexto con otra sesión del mismo usuario (login real, no copia de cookie).
    const email = (await (await page.request.get('/api/auth/session')).json()).user.email as string;
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
