import { test, expect } from '@playwright/test';

// Auth tests run WITHOUT saved session
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', () => {
  test('shows login page when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.fill('[placeholder="Email"]', 'wrong@test.com');
    await page.fill('[placeholder="Password"]', 'wrongpassword');
    await page.click('button:has-text("Sign In")');
    await expect(page.getByText(/Invalid email or password/)).toBeVisible({ timeout: 5_000 });
  });
});
