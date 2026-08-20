import { test, expect } from '@playwright/test';

test.describe('Smoke and security checks', () => {
  test('landing page loads and has no console errors or CSP violations', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');

    await expect(page).toHaveTitle(/Money/);
    await expect(page.locator('h1')).toContainText('Money');

    // Assert zero console errors and zero CSP violations
    expect(consoleErrors).toEqual([]);
  });
});
