const { chromium } = require('@playwright/test');

module.exports = async function globalSetup() {
  const baseUrl = 'http://localhost:3000';

  // Wait for server
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // Complete first-login password change via API
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@localhost', password: 'testpass123' }),
  });
  const body = await loginRes.json();

  if (body.requirePasswordChange) {
    const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];
    await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ currentPassword: 'testpass123', newPassword: 'testpass123' }),
    });
  }

  // Login via browser and save auth state (including httpOnly cookies)
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  await page.fill('[placeholder="Email"]', 'admin@localhost');
  await page.fill('[placeholder="Password"]', 'testpass123');

  // Listen for the response to capture the cookie
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/auth/login')),
    page.click('button:has-text("Sign In")'),
  ]);

  // Wait for app to load
  await page.waitForSelector('text=Dialer', { timeout: 10000 });

  // Get cookies from the browser context (includes httpOnly)
  const cookies = await context.cookies();

  // Save storage state with cookies
  await context.storageState({ path: 'e2e/.auth.json' });

  await browser.close();
};
