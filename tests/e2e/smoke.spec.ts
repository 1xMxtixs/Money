import { test, expect } from '@playwright/test';

test.describe('Smoke and Security Checks (F0-07 / SP-02, SP-03, doc 7 §7)', () => {
  test('landing page loads with all 9 page security headers and zero CSP violations', async ({ page }) => {
    const consoleErrors: string[] = [];
    const cspViolations: string[] = [];

    // Listen to securitypolicyviolation events and console errors
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP_VIOLATION: ${e.violatedDirective} blocked ${e.blockedURI}`);
      });
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
      if (
        text.toLowerCase().includes('csp_violation') ||
        text.toLowerCase().includes('content security policy') ||
        text.toLowerCase().includes('violates')
      ) {
        cspViolations.push(text);
      }
    });

    const response = await page.goto('/');
    expect(response).not.toBeNull();

    const headers = response!.headers();

    // Verify all mandatory page security headers (doc 7 §7)
    expect(headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');
    expect(headers['strict-transport-security']).not.toContain('preload');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe(
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
    );
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-xss-protection']).toBe('0');

    // Verify CSP contains nonce and strict-dynamic
    const csp = headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain('script-src');
    expect(csp).toContain('strict-dynamic');
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]{24}' 'strict-dynamic'/);

    // Verify DOM rendered correctly
    await expect(page).toHaveTitle(/Money/);
    await expect(page.locator('h1')).toContainText('Money');

    // Assert zero console errors and zero CSP violations on clean load
    expect(consoleErrors).toEqual([]);
    expect(cspViolations).toEqual([]);
  });

  test('consecutive requests receive distinct nonces (T6)', async ({ request }) => {
    const res1 = await request.get('/');
    const csp1 = res1.headers()['content-security-policy'];
    const nonce1Match = csp1.match(/'nonce-([^']+)'/);
    expect(nonce1Match).not.toBeNull();

    const res2 = await request.get('/');
    const csp2 = res2.headers()['content-security-policy'];
    const nonce2Match = csp2.match(/'nonce-([^']+)'/);
    expect(nonce2Match).not.toBeNull();

    expect(nonce1Match![1]).not.toBe(nonce2Match![1]);
  });

  test('console listener actively captures browser CSP violation when attempting unauthorized resource load (SP-03 / T7)', async ({
    page,
  }) => {
    const cspViolations: string[] = [];

    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP_VIOLATION: ${e.violatedDirective} blocked ${e.blockedURI}`);
      });
    });

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('CSP_VIOLATION') || text.toLowerCase().includes('violates')) {
        cspViolations.push(text);
      }
    });

    await page.goto('/');

    // Attempt unauthorized outbound network connection (blocked by connect-src 'self' https://*.ingest.sentry.io)
    await page.evaluate(() => {
      fetch('https://unauthorized-analytics-evil.com/track').catch(() => {});
    });

    await page.waitForTimeout(500);

    // Verify that the browser rejected the connection and the listener captured the CSP violation
    expect(cspViolations.length).toBeGreaterThan(0);
    expect(
      cspViolations.some(
        (v) => v.includes('CSP_VIOLATION') && (v.includes('connect-src') || v.includes('script-src'))
      )
    ).toBe(true);
  });
});
